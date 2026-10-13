import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import {
  holidayStripe,
  recordHolidayDeposit,
  recordHolidayInvoice,
} from "@/lib/holiday-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_HOLIDAY_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Webhook not configured." },
      { status: 503 },
    );
  let event: Stripe.Event;
  try {
    event = holidayStripe().webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") || "",
      secret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  const db = createAdminClient();
  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (
        session.metadata?.holiday_order_id &&
        session.payment_status === "paid"
      )
        await recordHolidayDeposit(db, session);
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.holiday_order_id) {
        const result = await db
          .from("holiday_orders")
          .update({ deposit_status: "expired" })
          .eq("id", session.metadata.holiday_order_id)
          .eq("stripe_checkout_session_id", session.id)
          .eq("deposit_status", "pending");
        if (result.error) throw result.error;
      }
    } else if (
      [
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.payment_action_required",
      ].includes(event.type)
    ) {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.metadata?.holiday_order_id)
        await recordHolidayInvoice(db, invoice.id);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(
      "Holiday webhook failed",
      event.id,
      error instanceof Error ? error.message : "Database failure",
    );
    return NextResponse.json(
      { error: "Holiday payment update failed." },
      { status: 500 },
    );
  }
}
