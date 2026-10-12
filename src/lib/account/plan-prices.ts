import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { stripeClient } from './server';
export async function ensurePlanPrice(planId: string) {
  const admin = createAdminClient();
  const stripe = stripeClient();
  const { data: plan, error } = await admin
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .eq('is_active', true)
    .single();
  if (error || !plan) throw new Error('This plan is unavailable.');
  if (plan.current_stripe_price_id) {
    const price = await stripe.prices.retrieve(plan.current_stripe_price_id);
    if (
      price.active &&
      price.currency === 'usd' &&
      price.unit_amount === plan.price_cents &&
      price.recurring?.interval === plan.billing_interval &&
      price.recurring?.interval_count === plan.billing_interval_count
    )
      return { plan, priceId: price.id };
  }
  const productId =
    plan.stripe_product_id ||
    (
      await stripe.products.create(
        {
          name: `Netta's Pantry — ${plan.name}`,
          metadata: { subscription_plan_id: plan.id },
        },
        { idempotencyKey: `plan-product:${plan.id}` },
      )
    ).id;
  const price = await stripe.prices.create(
    {
      product: productId,
      currency: 'usd',
      unit_amount: plan.price_cents,
      recurring: {
        interval: plan.billing_interval,
        interval_count: plan.billing_interval_count,
      },
      metadata: { subscription_plan_id: plan.id },
    },
    {
      idempotencyKey: `plan-price:${plan.id}:${plan.price_cents}:${plan.billing_interval}:${plan.billing_interval_count}`,
    },
  );
  const update = await admin
    .from('subscription_plans')
    .update({ stripe_product_id: productId, current_stripe_price_id: price.id })
    .eq('id', plan.id);
  if (update.error) throw update.error;
  return { plan, priceId: price.id };
}
