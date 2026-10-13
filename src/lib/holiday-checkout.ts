import {
  HOLIDAY_ENTREES,
  HOLIDAY_BREADS,
  HOLIDAY_DESSERTS,
  holidayQuote,
  holidayPaymentConsent,
  type HolidaySettings,
} from "./holiday-menu";

export function holidayToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validateHolidayCheckout(
  input: Record<string, unknown>,
  settings: HolidaySettings,
  now = new Date(),
) {
  const text = (key: string, max = 200) => {
    const value = input[key];
    if (typeof value !== "string" || value.length > max)
      throw new Error("Enter valid contact and order details.");
    return value.trim();
  };
  const key = text("checkoutKey");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    throw new Error("Reload the page before checking out.");
  if (input.version !== settings.version)
    throw new Error(
      "Holiday pricing changed. Reload to review the current price.",
    );
  if (input.consent !== true)
    throw new Error(
      "Authorize the deposit and automatic balance payment before continuing.",
    );
  const full_name = text("name");
  const email = text("email", 254).toLowerCase();
  const phone = text("phone", 40);
  if (
    !full_name ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    phone.replace(/\D/g, "").length < 10
  )
    throw new Error("Enter your name, email, and phone number.");
  const entree = text("entree");
  const bread = text("bread");
  const dessert = text("dessert");
  if (
    !(HOLIDAY_ENTREES as readonly string[]).includes(entree) ||
    !(HOLIDAY_BREADS as readonly string[]).includes(bread) ||
    !(HOLIDAY_DESSERTS as readonly string[]).includes(dessert)
  )
    throw new Error("Choose items from the holiday menu.");
  if (typeof input.extraDessert !== "boolean")
    throw new Error("Invalid dessert selection.");
  const fulfillment = text("fulfillment");
  if (!["pickup", "delivery"].includes(fulfillment))
    throw new Error("Choose pickup or delivery.");
  const address = text("address", 1000);
  const zip = text("zip", 5);
  if (fulfillment === "pickup" && !settings.pickup_location)
    throw new Error("Pickup is not available yet.");
  if (
    fulfillment === "delivery" &&
    (!address || !settings.delivery_zips.includes(zip))
  )
    throw new Error(
      "Enter a delivery address and an eligible delivery ZIP code.",
    );
  const occasion = text("occasion");
  const today = holidayToday(now);
  let event_date: string;
  if (occasion === "thanksgiving" || occasion === "christmas") {
    const deadline =
      occasion === "thanksgiving"
        ? settings.thanksgiving_deadline
        : settings.christmas_deadline;
    event_date =
      occasion === "thanksgiving"
        ? settings.thanksgiving_fulfillment
        : settings.christmas_fulfillment;
    if (today > deadline || event_date <= today)
      throw new Error("Ordering for that holiday has closed.");
  } else if (occasion === "party") {
    event_date = text("eventDate", 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(event_date) ||
      Number.isNaN(Date.parse(`${event_date}T12:00:00Z`)) ||
      new Date(`${event_date}T12:00:00Z`).toISOString().slice(0, 10) !==
        event_date
    )
      throw new Error("Choose a valid event date.");
    const lead =
      (Date.parse(`${event_date}T12:00:00Z`) -
        Date.parse(`${today}T12:00:00Z`)) /
      86400000;
    if (lead < 7 || lead > 365)
      throw new Error(
        "Choose a party date at least seven days away and within the next year.",
      );
  } else throw new Error("Choose Thanksgiving, Christmas, or a holiday party.");
  const people = input.people;
  if (typeof people !== "number")
    throw new Error("Enter a whole-number group size.");
  const quote = holidayQuote(
    settings,
    people,
    input.extraDessert,
    fulfillment === "delivery",
  );
  // Prices sent by a browser are never used; the preview total is only compared
  // so a customer cannot inadvertently accept a different checkout amount.
  if (input.expectedTotal !== quote.totalCents)
    throw new Error("The total changed. Reload to review the current price.");
  return {
    key,
    quote,
    details: {
      full_name,
      email,
      phone,
      entree,
      bread,
      dessert,
      extra_dessert: input.extraDessert,
      fulfillment,
      address: fulfillment === "delivery" ? address : "",
      zip: fulfillment === "delivery" ? zip : "",
      occasion,
      event_date,
      people,
    },
    consent: holidayPaymentConsent(
      quote.totalCents,
      quote.depositCents,
      quote.balanceCents,
    ),
  };
}
