export const SALES_TAX_BPS = 825;
export const SALES_TAX_LABEL = 'Sales tax (8.25%)';

export function salesTaxCents(amountCents: number, rateBps = SALES_TAX_BPS) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || !Number.isSafeInteger(rateBps) || rateBps < 0)
    throw new Error('Invalid taxable amount.');
  return Math.round(amountCents * rateBps / 10000);
}

/** Stripe manual rates can round per line or per invoice. Stripe's final amount is authoritative. */
export function orderTaxCents(amounts: number[]) {
  return amounts.reduce((total, amount) => total + salesTaxCents(amount), 0);
}
