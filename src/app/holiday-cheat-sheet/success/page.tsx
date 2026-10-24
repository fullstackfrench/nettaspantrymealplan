import Link from "next/link";
import { holidayStripe } from "@/lib/holiday-payments";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HolidaySuccess({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  let confirmed = false;
  let amounts: {
    total_cents: number;
    deposit_cents: number;
    balance_cents: number;
    balance_status: string;
    invoice_url: string | null;
  } | null = null;
  if (
    searchParams.session_id?.startsWith("cs_") &&
    searchParams.session_id.length < 300
  ) {
    try {
      const session = await holidayStripe().checkout.sessions.retrieve(
        searchParams.session_id,
      );
      if (
        session.metadata?.holiday_order_id &&
        session.status === "complete" &&
        session.payment_status === "paid"
      ) {
        const { data } = await createAdminClient()
          .from("holiday_orders")
          .select(
            "total_cents, deposit_cents, balance_cents, deposit_status, balance_status, invoice_url",
          )
          .eq("id", session.metadata.holiday_order_id)
          .eq("stripe_checkout_session_id", session.id)
          .maybeSingle();
        confirmed = data?.deposit_status === "paid" && data.balance_cents === 0;
        amounts = data;
      }
    } catch {
      /* A redirect alone does not prove that payment was received. */
    }
  }
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="rounded-panel border border-brand-plum/15 bg-white p-8 shadow-soft">
        <h1 className="font-display text-3xl font-bold text-brand-plum">
          {confirmed
            ? "Your holiday payment is confirmed"
            : "Checking your holiday payment"}
        </h1>
        <p className="mt-5 leading-7 text-ink/70">
          {confirmed
            ? "Thank you! Your holiday order is booked and paid in full. Nothing remains due at pickup or delivery."
            : "We haven’t confirmed your payment yet. Refresh this page shortly. Please avoid placing another order while confirmation is pending."}
        </p>
        {amounts && (
          <dl className="mt-6 space-y-3 text-ink/75">
            <div>
              <dt>Order total</dt>
              <dd className="font-bold">{formatCents(amounts.total_cents)}</dd>
            </div>
            <div>
              <dt>Paid at checkout</dt>
              <dd className="font-bold">
                {formatCents(amounts.deposit_cents)}
              </dd>
            </div>

          </dl>
        )}
        <Link
          href="/holiday-cheat-sheet"
          className="mt-7 block font-bold text-brand-plum underline"
        >
          Back to the holiday menu
        </Link>
      </div>
    </section>
  );
}
