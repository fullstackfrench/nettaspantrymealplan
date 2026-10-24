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
  if (order.deposit_cents !== order.total_cents || order.balance_cents !== 0)
    throw new Error("Holiday checkout is being updated. Reload the page before starting a new order.");
  const stripe = holidayStripe();
  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
    );
    if (existing.status === "open" && existing.url && existing.amount_total === order.total_cents && existing.currency === "usd") return existing.url;
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
                  name: "Hassle-free Holidays",
                  description: `Holiday order total: $${(order.total_cents / 100).toFixed(2)}.`,
                },
              },
            },
          ],
          payment_intent_data: {
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
    if (session.amount_total !== order.total_cents || session.currency !== "usd")
      throw new Error("The checkout amount does not match the holiday order total.");
    if (session.status !== "open" || !session.url)
      throw new Error(
        "This checkout was completed or expired. Reload the page before starting another order.",
      );
    return session.url;
  } finally {
    await updateHolidayOrder(db, order.id, { billing_lease_until: null });
  }
}

export async function recordHolidayPayment(
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
    order.deposit_cents !== order.total_cents || order.balance_cents !== 0 ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    session.amount_total !== order.deposit_cents ||
    stripeId(session.customer) !== order.stripe_customer_id ||
    (order.stripe_checkout_session_id &&
      order.stripe_checkout_session_id !== session.id)
  )
    throw new Error("Holiday payment verification failed.");
  const stripe = holidayStripe();
  const intentId = stripeId(session.payment_intent);
  if (!intentId) throw new Error("The payment has no payment intent.");
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (
    intent.status !== "succeeded" ||
    intent.amount_received !== order.deposit_cents ||
    stripeId(intent.customer) !== order.stripe_customer_id ||
    intent.currency !== "usd" ||
    intent.metadata.holiday_order_id !== order.id
  )
    throw new Error("Full payment verification failed.");
  await updateHolidayOrder(db, order.id, {
    deposit_status: "paid",
    balance_status: "paid",
    stripe_checkout_session_id: session.id,
    stripe_deposit_intent_id: intent.id,
    stripe_payment_method_id: null,
  });
}
