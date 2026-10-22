import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { stripeClient } from '@/lib/account/server';
export const runtime = 'nodejs';
function id(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id || null;
}
function check(result: { error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
}
export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json(
      { error: 'Webhook is not configured.' },
      { status: 503 },
    );
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get('stripe-signature') || '',
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const prior = await admin
    .from('stripe_webhook_events')
    .select('processing_status')
    .eq('stripe_event_id', event.id)
    .maybeSingle();
  if (prior.error)
    return NextResponse.json(
      { error: 'Unable to record payment event.' },
      { status: 500 },
    );
  if (prior.data?.processing_status === 'processed')
    return NextResponse.json({ received: true });
  check(
    await admin.from('stripe_webhook_events').upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        processing_status: 'processing',
      },
      { onConflict: 'stripe_event_id' },
    ),
  );
  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        if (session.metadata?.order_change_id) {
          const change = await admin
            .from('customer_order_changes')
            .select('*')
            .eq('id', session.metadata.order_change_id)
            .single();
          check(change);
          if (
            !change.data ||
            change.data.stripe_checkout_session_id !== session.id ||
            session.currency !== 'usd' ||
            session.amount_total !==
              change.data.new_total_cents - change.data.old_total_cents
          )
            throw new Error(
              'Adjustment payment does not match reserved order change.',
            );
          check(
            await admin.rpc('finish_customer_order_change', {
              p_change_id: change.data.id,
            }),
          );
        } else if (session.metadata?.order_id) {
          const order = await admin
            .from('orders')
            .select('id,total_cents')
            .eq('id', session.metadata.order_id)
            .single();
          check(order);
          if (
            !order.data ||
            session.currency !== 'usd' ||
            session.amount_total !== order.data.total_cents
          )
            throw new Error('Payment amount does not match order.');
          const subscription = session.subscription
            ? await stripe.subscriptions.retrieve(id(session.subscription)!)
            : null;
          const price = subscription?.items.data[0]?.price;
          let paymentIntent = id(session.payment_intent);
          if (!paymentIntent && session.invoice) {
            const invoice = await stripe.invoices.retrieve(
              id(session.invoice)!,
            );
            paymentIntent = id(invoice.payment_intent);
          }
          check(
            await admin.rpc('record_customer_checkout_payment', {
              p_order_id: order.data.id,
              p_session_id: session.id,
              p_payment_intent_id: paymentIntent,
              p_stripe_customer_id: id(session.customer),
              p_stripe_subscription_id: id(session.subscription),
              p_stripe_price_id: price?.id || null,
              p_recurring_amount: price?.unit_amount
                ? price.unit_amount *
                  (subscription?.items.data[0]?.quantity || 1)
                : null,
            }),
          );
        }
      }
    } else if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.currency !== 'usd')
        throw new Error('Unsupported invoice currency.');
      if (
        invoice.subscription &&
        invoice.billing_reason !== 'subscription_create'
      )
        check(
          await admin.rpc('record_customer_subscription_invoice', {
            p_invoice_id: invoice.id,
            p_stripe_subscription_id: id(invoice.subscription),
            p_payment_intent_id: id(invoice.payment_intent),
            p_amount: invoice.amount_paid,
          }),
        );
    } else if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const remote = event.data.object as Stripe.Subscription;
      const status =
        remote.status === 'canceled'
          ? 'canceled'
          : remote.pause_collection
            ? 'paused'
            : remote.status === 'active' || remote.status === 'trialing'
              ? 'active'
              : remote.status;
      const values: Record<string, unknown> = {
        status,
        cancel_at_period_end: remote.cancel_at_period_end,
        resumes_at: remote.pause_collection?.resumes_at
          ? new Date(remote.pause_collection.resumes_at * 1000).toISOString()
          : null,
      };
      const price = remote.items.data[0]?.price;
      if (price) {
        const plan = await admin
          .from('subscription_plans')
          .select('*')
          .eq('current_stripe_price_id', price.id)
          .maybeSingle();
        check(plan);
        if (plan.data)
          Object.assign(values, {
            subscription_plan_id: plan.data.id,
            plan_size: plan.data.included_credits,
            included_credits_snapshot: plan.data.included_credits,
            plan_code_snapshot: plan.data.code,
            plan_name_snapshot: plan.data.name,
            price_cents_snapshot: plan.data.price_cents,
            billing_interval_snapshot: plan.data.billing_interval,
            billing_interval_count_snapshot: plan.data.billing_interval_count,
            stripe_price_id: price.id,
          });
      }
      check(
        await admin
          .from('subscriptions')
          .update(values)
          .eq('stripe_subscription_id', remote.id),
      );
    } else if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.order_change_id) {
        // Let the customer retry with the same reserved payload and a fresh session.
        check(
          await admin
            .from('customer_order_changes')
            .update({ status: 'pending' })
            .eq('id', session.metadata.order_change_id)
            .eq('stripe_checkout_session_id', session.id),
        );
      }
    }
    check(
      await admin
        .from('stripe_webhook_events')
        .update({
          processing_status: 'processed',
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('stripe_event_id', event.id),
    );
    revalidatePath('/account');
    revalidatePath('/admin/orders');
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Customer billing webhook failed', event.id, error);
    await admin
      .from('stripe_webhook_events')
      .update({
        processing_status: 'failed',
        error_message:
          error instanceof Error ? error.message : 'Processing failed',
      })
      .eq('stripe_event_id', event.id);
    return NextResponse.json(
      { error: 'Payment event processing failed. Please retry.' },
      { status: 500 },
    );
  }
}
