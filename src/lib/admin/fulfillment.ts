import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireAdminContext } from '@/lib/auth/require-admin';
import { stripeClient } from '@/lib/account/server';

export async function transitionAdminFulfillment(id: string, status: string, kind: 'weekly' | 'holiday' = 'weekly') {
  const { supabase, userId } = await requireAdminContext();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid order.');
  if (!['packed', 'delivered', 'canceled'].includes(status)) throw new Error('Invalid fulfillment action.');
  if (status === 'canceled' && kind === 'weekly') {
    const current = await supabase.from('orders').select('status,payment_status,stripe_checkout_session_id,stripe_payment_intent_id').eq('id', id).single();
    if (current.error || !current.data) throw new Error('Order not found.');
    if (current.data.status !== 'canceled') {
      if (!['unpaid', 'failed'].includes(current.data.payment_status)) throw new Error('Paid or processing orders must use the existing cancellation and refund process.');
      // Expire an open checkout before cancellation so it cannot subsequently be paid.
      const sessionId = current.data.stripe_checkout_session_id ||
        (current.data.stripe_payment_intent_id?.startsWith('cs_') ? current.data.stripe_payment_intent_id : null);
      if (sessionId) {
        const stripe = stripeClient();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.status === 'complete' || session.payment_status === 'paid') throw new Error('Payment is processing. Refresh the order before canceling.');
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
      }
    }
  }
  const result = await supabase.rpc('transition_order_fulfillment', {
    p_order_id: id, p_to_status: status, p_actor_id: userId, p_kind: kind,
  });
  if (result.error) {
    if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('Fulfillment tracking is not enabled yet. Apply the approved migration before updating orders.');
    throw new Error(result.error.message || 'The order could not be updated.');
  }
  for (const path of ['/admin', '/admin/orders', '/admin/customers', '/admin/holidays', '/account']) revalidatePath(path);
  return result.data;
}
