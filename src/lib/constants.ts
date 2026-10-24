// ---------------------------------------------------------------
// Business rules in one place. Change prices/tiers here, not in JSX.
// ---------------------------------------------------------------

/** Legacy refundable rate, retained only for historical container records. */
export const DEPOSIT_PER_CONTAINER_CENTS = 300;
/** Non-refundable glass-container deposit, charged once per customer. */
export const GLASS_CONTAINER_DEPOSIT_CENTS = 5000;

export const DELIVERY_FEE_CENTS = 1000;

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
// All North Carolina ZIP codes use the 270–289 postal region (27006–28909).
// ---------------------------------------------------------------
export function isInDeliveryArea(zip: string): boolean {
  const clean = normalizeDeliveryZip(zip);
  if (!clean) return false;
  const n = parseInt(clean, 10);
  return n >= 27006 && n <= 28909;
}

export function normalizeDeliveryZip(zip: string): string | null {
  return /^(\d{5})(?:-\d{4})?$/.exec(zip.trim())?.[1] ?? null;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
