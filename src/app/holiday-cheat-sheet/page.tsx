import type { Metadata } from "next";
import Image from "next/image";
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
    "Chef Netta’s Thanksgiving and Christmas menu for holiday meal drop-offs and catering. Pickup and delivery available for groups of 18 or more.",
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
      <section
        className="relative isolate aspect-[4/3] w-full overflow-hidden bg-black text-white sm:aspect-[2/1]"
        aria-labelledby="holiday-page-title"
      >
        <h1 id="holiday-page-title" className="sr-only">Hassle-free Holidays</h1>
        <Image
          src="/hassle-free-holidays.png"
          alt="Glazed holiday ham surrounded by festive side dishes"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
        <p className="absolute inset-x-0 bottom-10 px-4 pb-7 text-center text-xl font-medium leading-snug text-white drop-shadow-lg sm:bottom-[100px] sm:pb-10 sm:text-3xl lg:pb-14 lg:text-4xl">
          You make the memories. We&apos;ll make the meal.
        </p>
      </section>
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
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris.
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
              Holiday catering &amp; drop-offs
            </h2>
            <dl className="mt-6 space-y-5 text-sm leading-6">
              <Detail
                title="Occasions"
                value="Thanksgiving, Christmas, and holiday parties"
              />
              <Detail
                title="Service"
                value="Meal drop-offs and traditional catering"
              />
              <Detail
                title="Fulfillment"
                value="Pickup and delivery available"
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
                value={`${formatCents(settings.per_person_cents)} per person · ${formatCents(settings.minimum_order_cents)} minimum package price`}
              />
              <Detail
                title="Second dessert"
                value={
                  settings.extra_dessert_cents === null
                    ? "Currently unavailable"
                    : `${formatCents(settings.extra_dessert_cents)} per ${settings.extra_dessert_basis === "person" ? "person" : "order"}`
                }
              />
              <Detail
                title="Payment"
                value="Full payment at checkout. Nothing remains due at pickup or delivery."
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
