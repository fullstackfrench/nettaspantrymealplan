import 'server-only';
import type Stripe from 'stripe';

export async function ensureSalesTaxRate(stripe: Stripe, inclusive = false) {
  for await (const rate of stripe.taxRates.list({ active: true, limit: 100 })) {
    if (rate.percentage === 8.25 && rate.inclusive === inclusive && rate.country === 'US' && rate.state === 'NC') return rate.id;
  }
  const rate = await stripe.taxRates.create({
    display_name: 'Sales tax', percentage: 8.25, inclusive,
    country: 'US', state: 'NC', description: "Netta's Pantry fixed 8.25% sales tax",
  }, { idempotencyKey: `nettas-pantry-fixed-sales-tax-825-${inclusive ? 'inclusive' : 'exclusive'}-v1` });
  return rate.id;
}
