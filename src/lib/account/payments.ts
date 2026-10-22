import 'server-only';
import { ensurePlanPrice } from './plan-prices';
import { createAdminClient } from '@/lib/supabase/server';
import { siteOrigin, stripeClient } from './server';

export async function createOrderCheckout(
  orderId: string,
  customerId: string,
  successPath = '/account?notice=payment',
  reuseCustomer = true,
) {
  const admin = createAdminClient();
  const { data: order, error } = await admin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .single();
  if (error || !order || order.status !== 'pending' || order.customer_change_id)
    throw new Error('This order is not available for payment.');
  const stripe = stripeClient();
  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
    );
    if (existing.status === 'open' && existing.url) return existing.url;
    if (existing.status === 'complete')
      throw new Error(
        'Payment was received. Please refresh your account shortly.',
      );
  }
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single();
  if (customerError || !customer) throw new Error('Customer not found.');
  const recurring = order.order_type === 'subscription';
  let planPrice: string | null = null;
  if (recurring && order.subscription_plan_id) {
    const configured = await ensurePlanPrice(order.subscription_plan_id);
    if (configured.plan.price_cents === order.subtotal_cents)
      planPrice = configured.priceId;
  }
  const session = await stripe.checkout.sessions.create(
    {
      mode: recurring ? 'subscription' : 'payment',
      ...(reuseCustomer && customer.stripe_customer_id
        ? { customer: customer.stripe_customer_id }
        : {
            customer_email: customer.email,
            ...(recurring ? {} : { customer_creation: 'always' as const }),
          }),
      line_items: [
        {
          quantity: 1,
          ...(planPrice
            ? { price: planPrice }
            : {
                price_data: {
                  currency: 'usd',
                  unit_amount: order.subtotal_cents,
                  product_data: {
                    name: recurring
                      ? "Netta's Pantry weekly meal plan"
                      : "Netta's Pantry meal order",
                  },
                  ...(recurring
                    ? {
                        recurring: {
                          interval: order.billing_interval_snapshot || 'week',
                          interval_count:
                            order.billing_interval_count_snapshot || 1,
                        },
                      }
                    : {}),
                },
              }),
        },
        ...(order.total_cents > order.subtotal_cents
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: 'usd',
                  unit_amount: order.total_cents - order.subtotal_cents,
                  product_data: {
                    name: 'Glass container deposit and delivery',
                  },
                },
              },
            ]
          : []),
      ],
      metadata: { order_id: order.id, customer_id: customerId },
      ...(recurring
        ? {
            subscription_data: {
              metadata: { order_id: order.id, customer_id: customerId },
            },
          }
        : {}),
      success_url: `${siteOrigin()}${successPath}`,
      cancel_url: `${siteOrigin()}/checkout`,
    },
    {
      idempotencyKey: `order-checkout:${order.id}:${order.total_cents}:${order.stripe_checkout_session_id || 'initial'}`,
    },
  );
  const update = await admin
    .from('orders')
    .update({
      stripe_checkout_session_id: session.id,
      checkout_expires_at: new Date(session.expires_at * 1000).toISOString(),
    })
    .eq('id', order.id);
  if (update.error) throw update.error;
  if (!session.url) throw new Error('Unable to open payment checkout.');
  return session.url;
}

export async function settleOrderChange(changeId: string) {
  const admin = createAdminClient();
  const { data: change, error } = await admin
    .from('customer_order_changes')
    .select('*, orders(*)')
    .eq('id', changeId)
    .single();
  if (error || !change) throw new Error('Order change not found.');
  if (change.status === 'applied')
    return { message: 'Your changes have been saved.' };
  if (!['pending', 'waiting_payment'].includes(change.status))
    throw new Error('This order change is no longer available.');
  const difference = change.new_total_cents - change.old_total_cents;
  if (change.paid && difference > 0) {
    const stripe = stripeClient();
    if (change.stripe_checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(
        change.stripe_checkout_session_id,
      );
      if (existing.status === 'open' && existing.url)
        return {
          url: existing.url,
          message: 'Complete payment to save your changes.',
        };
      if (existing.status === 'complete')
        return {
          message:
            'Payment received. Your changes are processing; refresh shortly.',
        };
    }
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: difference,
              product_data: { name: 'Meal order adjustment' },
            },
          },
        ],
        metadata: { order_change_id: change.id },
        success_url: `${siteOrigin()}/account?notice=payment`,
        cancel_url: `${siteOrigin()}/account`,
      },
      {
        idempotencyKey: `change-payment:${change.id}:${change.stripe_checkout_session_id || 'initial'}`,
      },
    );
    const update = await admin
      .from('customer_order_changes')
      .update({
        status: 'waiting_payment',
        stripe_checkout_session_id: session.id,
      })
      .eq('id', change.id);
    if (update.error) throw update.error;
    return {
      url: session.url!,
      message: 'Complete payment to save your changes.',
    };
  }
  if (change.paid && difference < 0) {
    const stripe = stripeClient();
    const order = change.orders;
    const ids: string[] = [];
    if (order.stripe_payment_intent_id?.startsWith('pi_'))
      ids.push(order.stripe_payment_intent_id);
    const initialSession =
      order.stripe_checkout_session_id ||
      (order.stripe_payment_intent_id?.startsWith('cs_')
        ? order.stripe_payment_intent_id
        : null);
    if (initialSession) {
      const session = await stripe.checkout.sessions.retrieve(initialSession, {
        expand: ['invoice'],
      });
      if (typeof session.payment_intent === 'string')
        ids.push(session.payment_intent);
      if (session.invoice && typeof session.invoice !== 'string') {
        const pi = session.invoice.payment_intent;
        if (typeof pi === 'string') ids.push(pi);
      }
    }
    const previous = await admin
      .from('customer_order_changes')
      .select('stripe_checkout_session_id')
      .eq('order_id', order.id)
      .eq('status', 'applied');
    if (previous.error) throw previous.error;
    for (const adjustment of previous.data ?? []) {
      if (adjustment.stripe_checkout_session_id) {
        const session = await stripe.checkout.sessions.retrieve(
          adjustment.stripe_checkout_session_id,
        );
        if (typeof session.payment_intent === 'string')
          ids.push(session.payment_intent);
      }
    }
    let remaining = -difference;
    for (const piId of Array.from(new Set(ids)).reverse()) {
      // Reuse each refund on retry before computing the outstanding balance.
      const refunds = await stripe.refunds.list({
        payment_intent: piId,
        limit: 100,
      });
      const prior = refunds.data.find(
        (refund) => refund.metadata?.order_change_id === change.id,
      );
      if (prior) {
        if (prior.status === 'failed' || prior.status === 'canceled')
          throw new Error(
            'The refund needs assistance. Please contact Chef Netta.',
          );
        remaining -= prior.amount;
        continue;
      }
      const pi = await stripe.paymentIntents.retrieve(piId, {
        expand: ['latest_charge'],
      });
      const charge =
        typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      const available = charge ? charge.amount - charge.amount_refunded : 0;
      const amount = Math.min(remaining, available);
      if (amount <= 0) continue;
      const refund = await stripe.refunds.create(
        {
          payment_intent: piId,
          amount,
          metadata: { order_change_id: change.id },
        },
        { idempotencyKey: `order-refund:${change.id}:${piId}` },
      );
      if (refund.status === 'failed' || refund.status === 'canceled')
        throw new Error(
          'The refund needs assistance. Please contact Chef Netta.',
        );
      remaining -= amount;
      const result = await admin
        .from('customer_order_changes')
        .update({ stripe_refund_id: refund.id })
        .eq('id', change.id);
      if (result.error) throw result.error;
      if (remaining === 0) break;
    }
    if (remaining > 0)
      throw new Error(
        'We could not complete the refund. Your change is reserved; please contact Chef Netta.',
      );
  }
  const result = await admin.rpc('finish_customer_order_change', {
    p_change_id: change.id,
  });
  if (result.error) throw result.error;
  return {
    message:
      change.operation === 'cancel'
        ? 'Your order has been canceled. Any refund has been submitted to your original payment method.'
        : 'Your order changes have been saved.',
  };
}
