"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  HOLIDAY_ENTREES,
  HOLIDAY_SIDES,
  HOLIDAY_BREADS,
  HOLIDAY_DESSERTS,
  otherHolidayDessert,
  holidayQuote,
  type HolidaySettings,
} from "@/lib/holiday-menu";
import { formatCents } from "@/lib/constants";

export default function HolidayMealBuilder({
  settings,
  paymentsReady,
}: {
  settings: HolidaySettings;
  paymentsReady: boolean;
}) {
  const [entree, setEntree] = useState<string>(HOLIDAY_ENTREES[0]);
  const [bread, setBread] = useState<string>(HOLIDAY_BREADS[0]);
  const [dessert, setDessert] = useState<string>(HOLIDAY_DESSERTS[0]);
  const [extraDessert, setExtraDessert] = useState(false);
  const [fulfillment, setFulfillment] = useState(
    !settings.pickup_location ? "delivery" : "pickup",
  );
  const [people, setPeople] = useState(String(settings.minimum_people));
  const [occasion, setOccasion] = useState("thanksgiving");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const enabled = settings.orders_open && paymentsReady;
  const fieldClass =
    "mt-2 min-h-12 w-full rounded-control border border-brand-plum/20 bg-white px-3 py-2 text-ink focus:border-brand-plum focus:outline-none focus:ring-2 focus:ring-brand-plum/20";
  let quote: ReturnType<typeof holidayQuote> | null = null;
  let quoteError: string | null = null;
  try {
    quote = holidayQuote(
      settings,
      Number(people),
      extraDessert,
      fulfillment === "delivery",
    );
  } catch (error) {
    quoteError =
      error instanceof Error ? error.message : "Enter a valid group size.";
  }
  const extraLabel =
    settings.extra_dessert_cents === null
      ? "Currently unavailable"
      : `${formatCents(settings.extra_dessert_cents)} per ${settings.extra_dessert_basis === "person" ? "person" : "order"}`;

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || !quote || pending) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      version: settings.version,
      people: Number(people),
      entree,
      bread,
      dessert,
      extraDessert,
      fulfillment,
      occasion,
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      address: String(form.get("address") ?? ""),
      zip: String(form.get("zip") ?? ""),
      eventDate: String(form.get("eventDate") ?? ""),
      consent: true, // Clicking checkout accepts the displayed, server-validated order total.
      expectedTotal: quote.totalCents,
    };
    const fingerprint = JSON.stringify(payload);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/holiday/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          checkoutKey: submission.current!.key,
        }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.url !== "string")
        throw new Error(result.error || "Checkout could not be started.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Invalid checkout destination.");
      window.location.assign(url.href);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      setPending(false);
    }
  }

  return (
    <section
      id="build-holiday-meal"
      className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20"
      aria-labelledby="build-holiday-title"
    >
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">
        Your holiday table
      </p>
      <h2
        id="build-holiday-title"
        className="mt-3 font-display text-3xl font-bold text-brand-plum"
      >
        Build your holiday meal
      </h2>
      <p className="mt-4 max-w-2xl leading-7 text-ink/65">
        Choose one entrée, one bread or dressing, and one dessert. Both sides
        are included.{" "}
        {settings.extra_dessert_cents === null
          ? "The second dessert is currently unavailable."
          : `Add the second dessert for ${extraLabel}.`}
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/65">
        {enabled ? "Current" : "Draft"} pricing:{" "}
        {formatCents(settings.minimum_order_cents)} for {settings.minimum_people} people,
        plus {formatCents(settings.per_person_cents)} for each additional person.
        Pricing depends on your group
        size, extras, and delivery. Prices may be updated before checkout; your
        accepted order total is locked once checkout begins.
      </p>
      <form
        onSubmit={checkout}
        className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_.8fr]"
      >
        <fieldset
          disabled={pending}
          className="grid gap-6 rounded-panel border border-brand-plum/15 bg-white p-6 sm:p-8"
        >
          <legend className="sr-only">Holiday meal selections</legend>
          <label className="text-sm font-bold text-brand-plum">
            Number of people
            <input
              type="number"
              min={settings.minimum_people}
              max={1000}
              step={1}
              required
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="text-sm font-bold text-brand-plum">
            Occasion
            <select
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
              className={fieldClass}
            >
              <option value="thanksgiving">Thanksgiving</option>
              <option value="christmas">Christmas</option>
              <option value="party">Holiday party</option>
            </select>
          </label>
          {occasion === "party" ? (
            <label className="text-sm font-bold text-brand-plum">
              Event date (at least 7 days ahead)
              <input
                name="eventDate"
                type="date"
                required
                className={fieldClass}
              />
            </label>
          ) : (
            <p className="text-sm leading-6 text-ink/70">
              Pickup/delivery date:{" "}
              {occasion === "thanksgiving"
                ? settings.thanksgiving_fulfillment
                : settings.christmas_fulfillment}
            </p>
          )}
          <Choice
            label="Entrée"
            value={entree}
            setValue={setEntree}
            options={HOLIDAY_ENTREES}
            className={fieldClass}
          />
          <div>
            <h3 className="text-sm font-bold text-brand-plum">
              Both sides included
            </h3>
            <ul className="mt-2 space-y-2 text-sm text-ink/70">
              {HOLIDAY_SIDES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <Choice
            label="Bread & dressing"
            value={bread}
            setValue={setBread}
            options={HOLIDAY_BREADS}
            className={fieldClass}
          />
          <Choice
            label="Included dessert"
            value={dessert}
            setValue={setDessert}
            options={HOLIDAY_DESSERTS}
            className={fieldClass}
          />
          <label className="flex items-start gap-3 rounded-control bg-cream p-4 text-sm leading-6 text-ink/75">
            <input
              type="checkbox"
              disabled={settings.extra_dessert_cents === null}
              checked={extraDessert}
              onChange={(event) => setExtraDessert(event.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-[#682952]"
            />
            <span>
              <span className="font-bold text-brand-plum">
                Add {otherHolidayDessert(dessert)}
              </span>
              <span className="block">{extraLabel}</span>
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-bold text-brand-plum">
              Pickup or delivery
            </legend>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-ink/75">
              {["pickup", "delivery"].map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 items-center gap-2"
                >
                  <input
                    type="radio"
                    name="holiday-fulfillment"
                    disabled={option === "pickup" && !settings.pickup_location}
                    value={option}
                    checked={fulfillment === option}
                    onChange={() => setFulfillment(option)}
                    className="h-4 w-4 accent-[#682952]"
                  />
                  {option === "pickup" ? "Pickup" : "Delivery"}
                </label>
              ))}
            </div>
          </fieldset>
          {fulfillment === "pickup" && settings.pickup_location && (
            <p className="text-sm leading-6 text-ink/70">
              Pickup: {settings.pickup_location}
            </p>
          )}
          {enabled && (
            <div className="grid gap-5 border-t border-brand-plum/10 pt-6">
              <ContactField
                label="Your name"
                name="name"
                className={fieldClass}
                autoComplete="name"
              />
              <ContactField
                label="Email"
                name="email"
                type="email"
                className={fieldClass}
                autoComplete="email"
              />
              <ContactField
                label="Phone"
                name="phone"
                type="tel"
                className={fieldClass}
                autoComplete="tel"
              />
              {fulfillment === "delivery" && (
                <>
                  <ContactField
                    label="Full delivery address"
                    name="address"
                    className={fieldClass}
                    autoComplete="street-address"
                  />
                  <ContactField
                    label="Delivery ZIP code"
                    name="zip"
                    className={fieldClass}
                    autoComplete="postal-code"
                  />
                  <p className="text-xs leading-6 text-ink/60">
                    Delivery is available throughout North Carolina, to all North Carolina ZIP codes.
                  </p>
                </>
              )}
            </div>
          )}
        </fieldset>
        <aside
          className="self-start rounded-panel bg-moss-50 p-6 sm:p-8"
          aria-labelledby="holiday-selection-title"
        >
          <h3
            id="holiday-selection-title"
            className="font-display text-2xl font-bold text-brand-plum"
          >
            Your selections
          </h3>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-ink/75">
            <li>{entree}</li>
            {HOLIDAY_SIDES.map((item) => (
              <li key={item}>{item}</li>
            ))}
            <li>{bread}</li>
            <li>{dessert} · Included</li>
            {extraDessert && <li>{otherHolidayDessert(dessert)} · Extra</li>}
            <li className="border-t border-brand-plum/10 pt-3 font-bold text-brand-plum">
              {people} people ·{" "}
              {fulfillment === "pickup" ? "Pickup" : "Delivery"}
            </li>
          </ul>
          <div aria-live="polite" aria-atomic="true">
            {quote ? (
              <dl className="mt-6 space-y-3 text-sm text-ink/75">
                <Amount label="Holiday package" value={quote.foodCents} />
                <Amount label="Second dessert" value={quote.extraCents} />
                <Amount label="Delivery" value={quote.deliveryCents} />
                <Amount
                  label="Order total"
                  value={quote.totalCents}
                />
              </dl>
            ) : (
              <p className="mt-5 text-sm text-brand-brick">{quoteError}</p>
            )}
          </div>
          {enabled && quote ? (
            <>
              <button
                disabled={pending}
                className="mt-6 min-h-12 w-full rounded-full bg-brand-plum px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {pending
                  ? "Preparing checkout…"
                  : "Continue to checkout"}
              </button>
            </>
          ) : (
            <p
              className="mt-6 rounded-control border border-brand-plum/15 bg-white p-4 text-sm leading-6 text-ink/65"
              role="status"
            >
              Menu preview only. Ordering will open after Chef Netta confirms
              the schedule and fulfillment details.
            </p>
          )}
          {error && (
            <p className="mt-5 text-sm text-brand-brick" role="alert">
              {error}
            </p>
          )}
        </aside>
      </form>
    </section>
  );
}

function Choice({
  label,
  value,
  setValue,
  options,
  className,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: readonly string[];
  className: string;
}) {
  return (
    <label className="text-sm font-bold text-brand-plum">
      {label}
      <select
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={className}
      >
        {options.map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
    </label>
  );
}
function ContactField({
  label,
  name,
  type = "text",
  className,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  className: string;
  autoComplete: string;
}) {
  return (
    <label className="text-sm font-bold text-brand-plum">
      {label}
      <input
        name={name}
        type={type}
        required
        maxLength={name === "address" ? 1000 : 254}
        className={className}
        autoComplete={autoComplete}
      />
    </label>
  );
}
function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-bold text-brand-plum">{formatCents(value)}</dd>
    </div>
  );
}
