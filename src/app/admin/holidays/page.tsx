import { requireAdmin } from "@/lib/auth/require-admin";
import { getHolidaySettings } from "@/lib/holiday-settings";
import { formatCents } from "@/lib/constants";
import { HOLIDAY_SIDES, otherHolidayDessert } from "@/lib/holiday-menu";
import HolidaySettingsForm from "@/components/admin/HolidaySettingsForm";
import HolidayDeliveryButton from "@/components/admin/HolidayDeliveryButton";

export const dynamic = "force-dynamic";

export default async function HolidayAdmin() {
  const db = await requireAdmin();
  const { settings, installed } = await getHolidaySettings();
  const result = installed
    ? await db
        .from("holiday_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (result.error) throw new Error("Holiday orders could not be loaded.");
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">
          The Holiday Cheat Sheet
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-brand-plum">
          Holiday orders
        </h1>
      </div>
      <HolidaySettingsForm
        settings={settings}
        installed={installed}
      />
      <section className="space-y-5" aria-label="Holiday order queue">
        {!result.data?.length && (
          <p className="admin-empty-state">No holiday orders yet.</p>
        )}
        {result.data?.map((order) => (
          <article key={order.id} className="admin-card p-6">
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <h2 className="font-bold text-brand-plum">{order.full_name}</h2>
                <p className="mt-1 text-sm text-ink/65">
                  {order.email} · {order.phone}
                </p>
                <p className="mt-2 text-sm text-ink/65">
                  {order.occasion} · {order.event_date} · {order.people} people
                  · {order.fulfillment}
                </p>
                {order.address && (
                  <p className="mt-2 text-sm text-ink/65">
                    {order.address} · ZIP {order.zip}
                  </p>
                )}
              </div>
              <div className="text-sm leading-7 text-ink/75">
                <p className="font-bold text-brand-plum">
                  Total {formatCents(order.total_cents)}
                </p>
                <p>
                  Deposit {formatCents(order.deposit_cents)} ·{" "}
                  {order.deposit_status}
                </p>
                <p>
                  Balance {formatCents(order.balance_cents)} ·{" "}
                  {order.balance_status.replace("_", " ")}
                </p>
                <p>Fulfillment · {order.fulfillment_status}</p>
              </div>
            </div>
            <ul className="my-5 space-y-2 rounded-control bg-cream p-4 text-sm text-ink/70">
              <li>{order.entree}</li>
              {HOLIDAY_SIDES.map((side) => (
                <li key={side}>{side}</li>
              ))}
              <li>{order.bread}</li>
              <li>{order.dessert}</li>
              {order.extra_dessert && (
                <li>{otherHolidayDessert(order.dessert)} · Extra dessert</li>
              )}
            </ul>
            {order.deposit_status === "paid" &&
              order.balance_status !== "paid" && (
                <HolidayDeliveryButton
                  id={order.id}
                  balance={order.balance_cents}
                  delivered={order.fulfillment_status === "delivered"}
                />
              )}
            {order.payment_error && (
              <p className="mt-4 text-sm text-brand-brick">
                {order.payment_error}
              </p>
            )}
            {order.invoice_url && (
              <a
                href={order.invoice_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-bold text-brand-plum underline"
              >
                Open balance invoice / customer payment link
              </a>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
