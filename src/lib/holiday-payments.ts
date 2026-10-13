import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";

type Database = ReturnType<typeof createAdminClient>;
export type HolidayOrder = {
  id: string;
  full_name: string;
  email: string;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  consent_text: string;
  deposit_status: string;
  fulfillment_status: string;
  balance_status: string;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_balance_invoice_id: string | null;
};

export function holidayStripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Stripe is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
  });
}

export function holidayOrigin() {
  const origin = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  );
  if (!["http:", "https:"].includes(origin.protocol))
    throw new Error("Invalid site URL.");
  return origin.origin;
}

function stripeId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export async function updateHolidayOrder(
  db: Database,
  id: string,
  values: Record<string, unknown>,
) {
  const { error, data } = await db
    .from("holiday_orders")
    .update(values)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data)
    throw new Error("Holiday payment status could not be saved.");
}

export async function startHolidayCheckout(db: Database, order: HolidayOrder) {
  const stripe = holidayStripe();
  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
    );
    if (existing.status === "open" && existing.url) return existing.url;
    throw new Error(
      existing.status === "complete"
        ? "This checkout was already completed."
        : "This checkout expired. Reload the page to start again.",
    );
  }
  const claim = await db.rpc("claim_holiday_checkout", {
    p_order_id: order.id,
  });
  if (claim.error) throw new Error("Unable to start holiday checkout.");
  if (!claim.data?.length)
    throw new Error(
      "Checkout is already being prepared. Please try again shortly.",
    );
  order = claim.data[0];
  try {
    let customerId = order.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: order.email,
          name: order.full_name,
          metadata: { holiday_order_id: order.id },
        },
        { idempotencyKey: `holiday-customer:${order.id}` },
      );
      customerId = customer.id;
      await updateHolidayOrder(db, order.id, {
        stripe_customer_id: customerId,
      });
    }
    // A Stripe response can be lost before its ID is persisted. Recover that
    // session rather than creating another one after idempotency keys expire.
    const previous = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 100,
    });
    const recovered = previous.data.find(
      (item) => item.metadata?.holiday_order_id === order.id,
    );
    const session =
      recovered ??
      (await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer: customerId,
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: order.deposit_cents,
                product_data: {
                  name: "The Holiday Cheat Sheet — 50% order deposit",
                  description: `Order total $${(order.total_cents / 100).toFixed(2)}. Remaining $${(order.balance_cents / 100).toFixed(2)} charged when delivered/collected.`,
                },
              },
            },
          ],
          payment_intent_data: {
            setup_future_usage: "off_session",
            metadata: { holiday_order_id: order.id },
          },
          custom_text: { submit: { message: order.consent_text } },
          success_url: `${holidayOrigin()}/holiday-cheat-sheet/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${holidayOrigin()}/holiday-cheat-sheet#build-holiday-meal`,
          metadata: { holiday_order_id: order.id },
        },
        { idempotencyKey: `holiday-checkout:${order.id}` },
      ));
    await updateHolidayOrder(db, order.id, {
      stripe_checkout_session_id: session.id,
    });
    if (session.status !== "open" || !session.url)
      throw new Error(
        "This checkout was completed or expired. Reload the page before starting another order.",
      );
    return session.url;
  } finally {
    await updateHolidayOrder(db, order.id, { billing_lease_until: null });
  }
}

export async function recordHolidayDeposit(
  db: Database,
  session: Stripe.Checkout.Session,
) {
  const orderId = session.metadata?.holiday_order_id;
  if (!orderId) return;
  const found = await db
    .from("holiday_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (found.error) throw new Error("Holiday order not found.");
  const order = found.data as HolidayOrder;
  if (
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    session.amount_total !== order.deposit_cents ||
    stripeId(session.customer) !== order.stripe_customer_id ||
    (order.stripe_checkout_session_id &&
      order.stripe_checkout_session_id !== session.id)
  )
    throw new Error("Holiday deposit verification failed.");
  const stripe = holidayStripe();
  const intentId = stripeId(session.payment_intent);
  if (!intentId) throw new Error("The deposit has no payment intent.");
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (
    intent.status !== "succeeded" ||
    intent.amount_received !== order.deposit_cents ||
    stripeId(intent.customer) !== order.stripe_customer_id ||
    intent.currency !== "usd" ||
    intent.metadata.holiday_order_id !== order.id ||
    !stripeId(intent.payment_method)
  )
    throw new Error("Deposit payment verification failed.");
  await updateHolidayOrder(db, order.id, {
    deposit_status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_deposit_intent_id: intent.id,
    stripe_payment_method_id: stripeId(intent.payment_method),
  });
}

export function verifyHolidayInvoice(
  invoice: Stripe.Invoice,
  order: HolidayOrder,
) {
  if (
    invoice.metadata?.holiday_order_id !== order.id ||
    invoice.id !== order.stripe_balance_invoice_id ||
    stripeId(invoice.customer) !== order.stripe_customer_id ||
    invoice.currency !== "usd" ||
    invoice.total !== order.balance_cents ||
    order.fulfillment_status !== "delivered"
  )
    throw new Error("Balance invoice verification failed.");
}

export async function recordHolidayInvoice(db: Database, invoiceId: string) {
  const invoice = await holidayStripe().invoices.retrieve(invoiceId);
  const orderId = invoice.metadata?.holiday_order_id;
  if (!orderId) return;
  const found = await db
    .from("holiday_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (found.error) throw new Error("Holiday order not found.");
  const order = found.data as HolidayOrder;
  verifyHolidayInvoice(invoice, order);
  const paid =
    invoice.status === "paid" &&
    invoice.amount_paid === order.balance_cents &&
    invoice.amount_remaining === 0;
  if (order.balance_status === "paid" && !paid) return;
  await updateHolidayOrder(db, order.id, {
    balance_status: paid ? "paid" : "action_required",
    invoice_url: invoice.hosted_invoice_url,
    payment_error: paid
      ? null
      : "The balance is not paid. The customer may need to update or authorize their card using the invoice link.",
  });
}

export async function collectHolidayBalance(db: Database, orderId: string) {
  const claimed = await db.rpc("claim_holiday_balance", {
    p_order_id: orderId,
  });
  if (claimed.error) throw new Error("Unable to reserve the balance payment.");
  if (!claimed.data?.length) {
    const current = await db
      .from("holiday_orders")
      .select("balance_status")
      .eq("id", orderId)
      .single();
    if (!current.error && current.data.balance_status === "paid") return;
    throw new Error(
      "A balance payment is already processing. Refresh the order shortly.",
    );
  }
  const order = claimed.data[0] as HolidayOrder;
  const stripe = holidayStripe();
  try {
    if (!order.stripe_customer_id || !order.stripe_payment_method_id)
      throw new Error("The deposit payment method is missing.");
    let invoice: Stripe.Invoice;
    if (order.stripe_balance_invoice_id) {
      invoice = await stripe.invoices.retrieve(order.stripe_balance_invoice_id);
    } else {
      const previous = await stripe.invoices.list({
        customer: order.stripe_customer_id,
        limit: 100,
      });
      invoice =
        previous.data.find(
          (item) => item.metadata?.holiday_order_id === order.id,
        ) ??
        (await stripe.invoices.create(
          {
            customer: order.stripe_customer_id,
            currency: "usd",
            auto_advance: false,
            collection_method: "charge_automatically",
            default_payment_method: order.stripe_payment_method_id,
            pending_invoice_items_behavior: "exclude",
            description: `The Holiday Cheat Sheet — remaining balance. Order total $${(order.total_cents / 100).toFixed(2)}; deposit paid $${(order.deposit_cents / 100).toFixed(2)}.`,
            metadata: { holiday_order_id: order.id },
          },
          { idempotencyKey: `holiday-invoice:${order.id}` },
        ));
      await updateHolidayOrder(db, order.id, {
        stripe_balance_invoice_id: invoice.id,
      });
      order.stripe_balance_invoice_id = invoice.id;
    }
    if (invoice.status === "draft") {
      const lines = await stripe.invoices.listLineItems(invoice.id, {
        limit: 100,
      });
      if (!lines.data.length) {
        await stripe.invoiceItems.create(
          {
            customer: order.stripe_customer_id,
            invoice: invoice.id,
            currency: "usd",
            amount: order.balance_cents,
            description: "Remaining 50% holiday order balance",
            metadata: { holiday_order_id: order.id },
          },
          { idempotencyKey: `holiday-balance-line:${order.id}` },
        );
      } else if (
        lines.data.length !== 1 ||
        lines.data[0].amount !== order.balance_cents ||
        lines.data[0].metadata.holiday_order_id !== order.id
      )
        throw new Error(
          "The invoice lines do not match the accepted order balance.",
        );
      const draft = await stripe.invoices.retrieve(invoice.id);
      verifyHolidayInvoice(draft, order);
      invoice = await stripe.invoices.finalizeInvoice(
        invoice.id,
        { auto_advance: false },
        { idempotencyKey: `holiday-finalize:${order.id}` },
      );
    }
    verifyHolidayInvoice(invoice, order);
    await updateHolidayOrder(db, order.id, {
      invoice_url: invoice.hosted_invoice_url,
    });
    if (invoice.status === "paid") {
      await recordHolidayInvoice(db, invoice.id);
      return;
    }
    if (invoice.status !== "open")
      throw new Error(
        "This invoice cannot be charged. Review its status in Stripe.",
      );
    const intentId = stripeId(invoice.payment_intent);
    if (intentId) {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      if (intent.status === "processing" || intent.status === "succeeded") {
        await updateHolidayOrder(db, order.id, {
          balance_status: "processing",
          payment_error: null,
        });
        return;
      }
      if (intent.status === "requires_action")
        throw new Error(
          "Customer card approval is required. Share the balance invoice link.",
        );
    }
    await updateHolidayOrder(db, order.id, {
      balance_status: "processing",
      payment_error: null,
    });
    await stripe.invoices.pay(
      invoice.id,
      { off_session: true },
      { idempotencyKey: `holiday-pay:${order.id}:${invoice.attempt_count}` },
    );
    await recordHolidayInvoice(db, invoice.id);
  } catch (error) {
    const current = await db
      .from("holiday_orders")
      .select("balance_status")
      .eq("id", order.id)
      .single();
    // A webhook can settle the same invoice while the API request is timing out.
    if (current.data?.balance_status !== "paid") {
      await updateHolidayOrder(db, order.id, {
        balance_status: "action_required",
        payment_error:
          "Balance payment needs attention. Review the invoice before retrying or share its payment link with the customer.",
      });
    }
    console.error(
      "Holiday balance collection failed",
      order.id,
      error instanceof Error ? error.message : "Unknown failure",
    );
    throw new Error(
      "Delivery was recorded, but balance collection needs attention. Review the invoice payment status below.",
    );
  } finally {
    await updateHolidayOrder(db, order.id, { billing_lease_until: null });
  }
}
