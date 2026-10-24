export const HOLIDAY_ENTREES = [
  "Turkey wings with gravy",
  "Turkey breast",
  "Bourbon brown sugar ham",
] as const;

export const HOLIDAY_SIDES = [
  "Smoked Gouda mac and cheese",
  "West African collard greens",
] as const;

export const HOLIDAY_BREADS = [
  "Cornbread muffins",
  "Turkey dressing/stuffing",
] as const;

export const HOLIDAY_DESSERTS = [
  "Sweet potato soufflé with marshmallows",
  "Apple pie",
] as const;

export type HolidaySettings = {
  id: number;
  version: number;
  per_person_cents: number;
  minimum_order_cents: number;
  minimum_people: number;
  extra_dessert_cents: number | null;
  extra_dessert_basis: "person" | "order";
  delivery_fee_cents: number;
  orders_open: boolean;
  thanksgiving_deadline: string;
  thanksgiving_fulfillment: string;
  christmas_deadline: string;
  christmas_fulfillment: string;
  pickup_location: string;
  delivery_zips: string[];
};

export const HOLIDAY_DRAFT_SETTINGS: HolidaySettings = {
  id: 1,
  version: 1,
  per_person_cents: 1600,
  minimum_people: 18,
  minimum_order_cents: 30000,
  extra_dessert_cents: 4500,
  extra_dessert_basis: "order",
  delivery_fee_cents: 0,
  orders_open: false,
  thanksgiving_deadline: "2026-11-19",
  thanksgiving_fulfillment: "2026-11-25",
  christmas_deadline: "2026-12-18",
  christmas_fulfillment: "2026-12-24",
  pickup_location: "",
  delivery_zips: [],
};

export function holidayQuote(
  settings: HolidaySettings,
  people: number,
  extraDessert: boolean,
  delivery: boolean,
) {
  if (
    !Number.isSafeInteger(people) ||
    people < settings.minimum_people ||
    people > 1000
  ) {
    throw new Error(
      `Choose a group size between ${settings.minimum_people} and 1,000 people.`,
    );
  }
  if (extraDessert && settings.extra_dessert_cents === null) {
    throw new Error(
      "The second dessert is unavailable until its price is confirmed.",
    );
  }
  const extraCents = extraDessert
    ? settings.extra_dessert_cents! *
      (settings.extra_dessert_basis === "person" ? people : 1)
    : 0;
  const deliveryCents = delivery ? settings.delivery_fee_cents : 0;
  const foodCents = Math.max(
    people * settings.per_person_cents,
    settings.minimum_order_cents,
  );
  const totalCents = foodCents + extraCents + deliveryCents;
  // Retain the legacy field name for database compatibility; checkout collects the full total.
  const depositCents = totalCents;
  return {
    foodCents,
    extraCents,
    deliveryCents,
    totalCents,
    depositCents,
    balanceCents: 0,
  };
}

export function holidayPaymentConsent(total: number) {
  return `I authorize a full payment of $${(total / 100).toFixed(2)} for my holiday order at checkout. No remaining balance will be charged at pickup or delivery. Pricing changes after checkout will not change my accepted total.`;
}

export function otherHolidayDessert(dessert: string) {
  if (!HOLIDAY_DESSERTS.some((item) => item === dessert)) {
    throw new Error("Choose a dessert from the holiday menu.");
  }
  return HOLIDAY_DESSERTS.find((item) => item !== dessert)!;
}
