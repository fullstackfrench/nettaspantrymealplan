/** Food subtotal only; delivery fees and refundable deposits do not qualify. */
export const MINIMUM_ORDER_CENTS = 5500;
export const MINIMUM_ORDER_MESSAGE = 'The minimum food order is $55, before delivery fees and refundable container deposits.';

export function meetsOrderMinimum(subtotalCents: number) {
  return Number.isSafeInteger(subtotalCents) && subtotalCents >= MINIMUM_ORDER_CENTS;
}

export function assertOrderMinimum(subtotalCents: number) {
  if (!meetsOrderMinimum(subtotalCents)) throw new Error(MINIMUM_ORDER_MESSAGE);
}
