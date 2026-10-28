import type { Metadata } from "next";
import HolidayHero from "@/components/HolidayHero";
import HolidayMealBuilder from "@/components/HolidayMealBuilder";
import {
  HOLIDAY_ENTREES,
  HOLIDAY_SIDES,
  HOLIDAY_BREADS,
  HOLIDAY_DESSERTS,
} from "@/lib/holiday-menu";
import { getHolidaySettings } from "@/lib/holiday-settings";
import { formatCents } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hassle-free Holidays | Netta's Pantry",
  description:
    "Chef Netta’s Thanksgiving and Christmas menu for holiday meal drop-offs. Available for groups of 18 or more throughout North Carolina.",
};

const menu = [
  { title: "Entrées", note: "Choose one", items: HOLIDAY_ENTREES },
  { title: "Sides", note: "Both included", items: HOLIDAY_SIDES },
  { title: "Bread & Dressing", note: "Choose one", items: HOLIDAY_BREADS },
  {
    title: "Desserts",
    note: "Choose one · Add the second for an extra charge",
    items: HOLIDAY_DESSERTS,
  },
];

export default async function HolidayPage() {
  const { settings, installed } = await getHolidaySettings();
  const paymentsReady =
    installed &&
    Boolean(
      process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_HOLIDAY_WEBHOOK_SECRET,
    );
  return (
    <>
      <HolidayHero titleId="holiday-page-title" headingLevel={1} priority />
      <section
        id="holiday-menu"
        className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20"
      >
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">
          Gather around the table
        </p>
        <h2 className="mt-3 font-display text-3xl font-bold text-brand-plum sm:text-4xl">
          Chef Netta’s Holiday Menu
        </h2>
        <p className="mt-4 max-w-2xl leading-7 text-ink/65">
          Spend less time in the kitchen and more time making memories. Chef
          Netta is bringing the holiday favorites you love straight to your table,
          so all you have to do is gather, give thanks, and dig in.
        </p>
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {menu.map((group) => (
            <div
              key={group.title}
              className="rounded-panel border border-brand-plum/15 bg-white p-6 shadow-soft"
            >
              <h3 className="font-display text-2xl font-bold text-brand-plum">
                {group.title}
              </h3>
              {group.note && (
                <p className="mt-2 text-sm font-bold text-moss-700">
                  {group.note}
                </p>
              )}
              <ul className="mt-5 space-y-4 text-sm leading-6 text-ink/75">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <section className="border-y border-brand-plum/10 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold text-brand-plum">
              Holiday meal drop-offs
            </h2>
            <dl className="mt-6 space-y-5 text-sm leading-6">
              <Detail
                title="Occasions"
                value="Thanksgiving, Christmas, and holiday parties"
              />
              <Detail
                title="Service"
                value="Prepared holiday meals for drop-off"
              />
              <Detail
                title="Fulfillment"
                value="Pickup and delivery throughout North Carolina"
              />
              <Detail
                title="Group size"
                value={`Minimum ${settings.minimum_people} people`}
              />
              <Detail
                title={
                  settings.orders_open
                    ? "Package pricing"
                    : "Draft package pricing"
                }
                value={`${formatCents(settings.minimum_order_cents)} for ${settings.minimum_people} people · ${formatCents(settings.per_person_cents)} per additional person`}
              />
              <Detail
                title="Second dessert"
                value={
                  settings.extra_dessert_cents === null
                    ? "Currently unavailable"
                    : `${formatCents(settings.extra_dessert_cents)} per ${settings.extra_dessert_basis === "person" ? "person" : "order"}`
                }
              />
            </dl>
            <p className="mt-6 text-sm leading-6 text-ink/60">
              Your total depends on group size, extras, and delivery. Chef Netta
              may update pricing for new orders. Your accepted total is locked
              at checkout.
            </p>
          </div>
          <div className="rounded-panel bg-cream p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-brick">
              {settings.orders_open
                ? "Holiday schedule"
                : "Provisional schedule · Pending confirmation"}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold text-brand-plum">
              Plan your holiday
            </h2>
            <div className="mt-6 space-y-6 text-sm leading-7 text-ink/75">
              <div>
                <h3 className="font-bold text-brand-plum">Thanksgiving</h3>
                <p>Order deadline: {settings.thanksgiving_deadline}</p>
                <p>
                  Pickup &amp; delivery: {settings.thanksgiving_fulfillment}
                </p>
              </div>
              <div>
                <h3 className="font-bold text-brand-plum">Christmas</h3>
                <p>Order deadline: {settings.christmas_deadline}</p>
                <p>Pickup &amp; delivery: {settings.christmas_fulfillment}</p>
              </div>
              <div>
                <h3 className="font-bold text-brand-plum">Holiday parties</h3>
                <p>
                  Suggested advance notice: at least 7 days before your event.
                </p>
              </div>
            </div>
            <p className="mt-6 border-t border-brand-plum/10 pt-5 text-sm leading-6 text-ink/60">
              {settings.orders_open
                ? "Choose your group size below to see your full order total."
                : "Ordering will open once Chef Netta confirms the fulfillment details and schedule."}
            </p>
          </div>
        </div>
      </section>
      <HolidayMealBuilder
        key={settings.version}
        settings={settings}
        paymentsReady={paymentsReady}
      />
    </>
  );
}

function Detail({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-brand-plum">{title}</dt>
      <dd className="mt-1 text-ink/70">{value}</dd>
    </div>
  );
}
