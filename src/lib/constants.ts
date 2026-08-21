// ---------------------------------------------------------------
// Business rules in one place. Change prices/tiers here, not in JSX.
// ---------------------------------------------------------------

/** Refundable deposit charged per glass container. */
export const DEPOSIT_PER_CONTAINER_CENTS = 300;

/**
 * Subscribers are charged the deposit once, on their first order. After that
 * they swap empties for fulls each week, so they only ever hold one set.
 * One-time buyers pay the deposit every order and get it back on return.
 */
export const DEPOSIT_ONCE_FOR_SUBSCRIBERS = true;

export type PlanSize = 6 | 8 | 12;

export interface Plan {
  size: PlanSize;
  /** Per-meal price when on a weekly subscription. */
  subscriptionPriceCents: number;
  label: string;
  blurb: string;
}

export const PLANS: Plan[] = [
  { size: 6, subscriptionPriceCents: 1350, label: '6 meals / week', blurb: 'Lunches sorted.' },
  { size: 8, subscriptionPriceCents: 1275, label: '8 meals / week', blurb: 'Most popular.' },
  { size: 12, subscriptionPriceCents: 1195, label: '12 meals / week', blurb: 'Best value, feeds two.' },
];

/** Flat per-meal price with no subscription. */
export const ONE_TIME_PRICE_CENTS = 1450;

export const DELIVERY_FEE_CENTS = 0;

// ---------------------------------------------------------------
// Filter chips — mirrors the CookUnity-style bar. `id` must match
// the strings stored in meals.tags.
// ---------------------------------------------------------------
export interface FilterOption {
  id: string;
  label: string;
  icon: string;
}

export const FILTERS: FilterOption[] = [
  { id: 'all', label: 'All Meals', icon: '🍽' },
  { id: 'seafood', label: 'Seafood', icon: '🐟' },
  { id: 'poultry', label: 'Poultry', icon: '🍗' },
  { id: 'beef', label: 'Beef', icon: '🥩' },
  { id: 'vegetarian', label: 'Vegetarian', icon: '🥕' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'gluten-free', label: 'Gluten Free', icon: '🌾' },
  { id: 'dairy-free', label: 'Dairy Free', icon: '🥛' },
  { id: 'high-protein', label: 'High Protein', icon: '💪' },
  { id: 'under-600', label: 'Under 600 cal', icon: '⚖️' },
];

// ---------------------------------------------------------------
// Delivery area — North Carolina only.
// NC ZIP codes run 27006–28909. We check the prefix.
// ---------------------------------------------------------------
export function isInDeliveryArea(zip: string): boolean {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return false;
  const n = parseInt(clean, 10);
  return n >= 27006 && n <= 28909;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
