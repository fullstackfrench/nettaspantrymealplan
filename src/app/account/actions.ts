'use server';
import { canCancelOrder, canEditOrder } from '@/lib/account/policy';
import { ensurePlanPrice } from '@/lib/account/plan-prices';
import { revalidatePath } from 'next/cache';
import { accountContext, siteOrigin, stripeClient } from '@/lib/account/server';
import { createOrderCheckout, settleOrderChange } from '@/lib/account/payments';
import { isInDeliveryArea } from '@/lib/constants';

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to save changes. Please try again.';
}
function check(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
function address(form: FormData) {
  const result = Object.fromEntries(
    [
      'address_line1',
      'address_line2',
      'city',
      'zip',
      'delivery_notes',
      'full_name',
      'phone',
    ].map((key) => [
      key,
      String(form.get(key) ?? '')
        .trim()
        .slice(0, key === 'delivery_notes' ? 2000 : 200),
    ]),
  );
  if (!result.address_line1 || !result.city || !isInDeliveryArea(result.zip))
    throw new Error(
      'Enter a street address, city, and valid North Carolina ZIP.',
    );
  return result;
}
export async function saveProfile(form: FormData) {
  try {
    const { customer, admin } = await accountContext();
    check(
      await admin
        .from('customers')
        .update({ ...address(form), state: 'NC' })
        .eq('id', customer.id),
    );
    revalidatePath('/account');
    return { message: 'Your delivery details have been saved.' };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function changeOrder(form: FormData) {
  try {
    const { user, customer, admin } = await accountContext();
    const id = String(form.get('order_id') ?? '');
    const { data: order, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();
    if (error || !order) throw new Error('Order not found.');
    const operation = String(form.get('operation'));
    if (
      !order.customer_change_id &&
      !(operation === 'cancel' ? canCancelOrder(order) : canEditOrder(order))
    )
      throw new Error(
        'The order change window is closed. Orders can be canceled only within 24 hours of placement.',
      );
    const existingSession =
      order.stripe_checkout_session_id ||
      (order.stripe_payment_intent_id?.startsWith('cs_')
        ? order.stripe_payment_intent_id
        : null);
    if (
      existingSession &&
      order.status === 'pending' &&
      !order.customer_change_id
    ) {
      const stripe = stripeClient();
      const session = await stripe.checkout.sessions.retrieve(existingSession);
      if (session.status === 'open')
        await stripe.checkout.sessions.expire(session.id);
      else if (session.status === 'complete')
        throw new Error(
          'Payment is processing. Refresh your account before changing this order.',
        );
    }
    const result = await admin.rpc('begin_customer_order_change', {
      p_user_id: user.id,
      p_order_id: id,
      p_request_key: String(form.get('request_key')),
      p_operation: operation,
      p_items:
        operation === 'cancel' ? [] : JSON.parse(String(form.get('items'))),
      p_address: operation === 'cancel' ? {} : address(form),
    });
    check(result);
    const change = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!change?.id) throw new Error('Unable to prepare your changes.');
    const saved = await settleOrderChange(change.id);
    revalidatePath('/account');
    revalidatePath('/admin/orders');
    return saved;
  } catch (error) {
    return { error: message(error) };
  }
}
export async function retryOrderChange(changeId: string) {
  try {
    const { customer, admin } = await accountContext();
    const r = await admin
      .from('customer_order_changes')
      .select('id')
      .eq('id', changeId)
      .eq('customer_id', customer.id)
      .single();
    check(r);
    const result = await settleOrderChange(changeId);
    revalidatePath('/account');
    return result;
  } catch (error) {
    return { error: message(error) };
  }
}
export async function payOrder(id: string) {
  try {
    const { customer } = await accountContext();
    return { url: await createOrderCheckout(id, customer.id) };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function manageSubscription(form: FormData) {
  try {
    const { customer, admin } = await accountContext();
    const { data: sub, error } = await admin
      .from('subscriptions')
      .select('*')
      .eq('id', String(form.get('subscription_id')))
      .eq('customer_id', customer.id)
      .single();
    if (
      error ||
      !sub ||
      !sub.stripe_subscription_id ||
      sub.status === 'canceled'
    )
      throw new Error('Subscription not found or not available for changes.');
    const stripe = stripeClient();
    const remote = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id,
    );
    if (
      remote.customer !== customer.stripe_customer_id &&
      remote.metadata.customer_id !== customer.id
    )
      throw new Error('Subscription ownership could not be verified.');
    const operation = String(form.get('operation'));
    let values: Record<string, unknown> = {};
    if (operation === 'cancel') {
      await stripe.subscriptions.update(remote.id, {
        cancel_at_period_end: true,
      });
      values = { cancel_at_period_end: true };
    } else if (operation === 'pause') {
      await stripe.subscriptions.update(remote.id, {
        pause_collection: { behavior: 'void' },
      });
      values = { status: 'paused', resumes_at: null };
    } else if (operation === 'resume') {
      await stripe.subscriptions.update(remote.id, {
        pause_collection: '',
        cancel_at_period_end: false,
      });
      values = {
        status: 'active',
        resumes_at: null,
        cancel_at_period_end: false,
      };
    } else if (operation === 'skip') {
      if (
        remote.items.data[0]?.price.recurring?.interval !== 'week' ||
        remote.items.data[0]?.price.recurring?.interval_count !== 1
      )
        throw new Error('Skip a week is available for weekly plans.');
      if (remote.pause_collection)
        throw new Error(
          'Resume this subscription before skipping its next week.',
        );
      const resumesAt = remote.current_period_end + 7 * 86400;
      await stripe.subscriptions.update(remote.id, {
        pause_collection: { behavior: 'void', resumes_at: resumesAt },
      });
      values = {
        status: 'paused',
        resumes_at: new Date(resumesAt * 1000).toISOString(),
      };
    } else if (operation === 'plan') {
      const { plan, priceId } = await ensurePlanPrice(
        String(form.get('plan_id')),
      );
      // No immediate proration: the new plan rate applies on the next invoice.
      await stripe.subscriptions.update(remote.id, {
        items: [{ id: remote.items.data[0].id, price: priceId, quantity: 1 }],
        proration_behavior: 'none',
      });
      values = {
        subscription_plan_id: plan.id,
        plan_size: plan.included_credits,
        plan_code_snapshot: plan.code,
        plan_name_snapshot: plan.name,
        included_credits_snapshot: plan.included_credits,
        price_cents_snapshot: plan.price_cents,
        billing_interval_snapshot: plan.billing_interval,
        billing_interval_count_snapshot: plan.billing_interval_count,
        stripe_price_id: priceId,
      };
    } else throw new Error('Invalid subscription action.');
    check(
      await admin
        .from('subscriptions')
        .update(values)
        .eq('id', sub.id)
        .eq('customer_id', customer.id),
    );
    revalidatePath('/account');
    return {
      message:
        operation === 'cancel'
          ? 'Your subscription will end after the current billing period. Existing orders are unchanged.'
          : operation === 'skip'
            ? 'Your next weekly billing cycle will be skipped. Existing orders are unchanged.'
            : operation === 'plan'
              ? 'Your plan has changed. The new rate applies on your next bill; existing orders are unchanged.'
              : 'Your subscription has been updated. Existing orders are unchanged.',
    };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function saveWeeklyChoices(form: FormData) {
  try {
    const { user, admin } = await accountContext();
    const result = await admin.rpc('save_customer_week_choices', {
      p_user_id: user.id,
      p_subscription_id: String(form.get('subscription_id')),
      p_menu_id: String(form.get('menu_id')),
      p_items: JSON.parse(String(form.get('items'))),
    });
    check(result);
    revalidatePath('/account');
    return { message: 'Your upcoming meal choices have been saved.' };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function openBillingPortal(subscriptionId?: string) {
  try {
    const { customer, admin } = await accountContext();
    let billingCustomer = customer.stripe_customer_id;
    if (subscriptionId) {
      const result = await admin
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('id', subscriptionId)
        .eq('customer_id', customer.id)
        .single();
      check(result);
      if (!result.data?.stripe_subscription_id)
        throw new Error('Subscription not found.');
      const remote = await stripeClient().subscriptions.retrieve(
        result.data.stripe_subscription_id,
      );
      if (
        remote.customer !== customer.stripe_customer_id &&
        remote.metadata.customer_id !== customer.id
      )
        throw new Error('Subscription ownership could not be verified.');
      billingCustomer =
        typeof remote.customer === 'string'
          ? remote.customer
          : remote.customer.id;
    }
    if (!billingCustomer) throw new Error('No billing account exists yet.');
    const session = await stripeClient().billingPortal.sessions.create({
      customer: billingCustomer,
      return_url: `${siteOrigin()}/account`,
    });
    return { url: session.url };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function discardOrderChange(changeId: string) {
  try {
    const { user, customer, admin } = await accountContext();
    const r = await admin
      .from('customer_order_changes')
      .select('*')
      .eq('id', changeId)
      .eq('customer_id', customer.id)
      .single();
    check(r);
    const change = r.data;
    if (
      !change ||
      change.operation !== 'edit' ||
      !['pending', 'waiting_payment'].includes(change.status) ||
      change.stripe_refund_id ||
      (change.paid && change.new_total_cents < change.old_total_cents)
    )
      throw new Error(
        'This change is already processing and cannot be discarded.',
      );
    if (change.stripe_checkout_session_id) {
      const stripe = stripeClient();
      const session = await stripe.checkout.sessions.retrieve(
        change.stripe_checkout_session_id,
      );
      if (session.status === 'complete')
        throw new Error(
          'Payment is processing. This change cannot be discarded.',
        );
      if (session.status === 'open')
        await stripe.checkout.sessions.expire(session.id);
    }
    check(
      await admin.rpc('discard_customer_order_change', {
        p_user_id: user.id,
        p_change_id: change.id,
      }),
    );
    revalidatePath('/account');
    return {
      message:
        'The pending edit was discarded. Your original order is unchanged.',
    };
  } catch (error) {
    return { error: message(error) };
  }
}
