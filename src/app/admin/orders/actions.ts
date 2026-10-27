'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import type { OrderDetailsResult, AdminOrderDetails, OrderContainerEvent } from '@/lib/admin/order-details';
import { setOrderStatus } from '../actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(id: string) {
  if (!UUID.test(id)) throw new Error('Invalid order.');
}

export async function loadOrderDetails(id: string): Promise<{ data?: OrderDetailsResult; error?: string }> {
  try {
    const db = await requireAdmin();
    validId(id);
    const order = await db.from('orders')
      .select('*, customers(*), order_items(*, meals(name))').eq('id', id).maybeSingle();
    if (order.error) throw new Error('Order details could not be loaded. Please try again.');
    if (!order.data) throw new Error('This order could not be found.');
    const [events, notes, history] = await Promise.all([
      db.from('container_events').select('id,kind,quantity,deposit_delta_cents,note,created_at')
        .eq('order_id', id).order('created_at', { ascending: false }),
      db.from('admin_order_notes').select('note').eq('order_id', id).maybeSingle(),
      db.from('order_fulfillment_history').select('id,from_status,to_status,occurred_at,recorded_at,is_historical').eq('order_id', id).order('recorded_at', { ascending: true }),
    ]);
    if (events.error) throw new Error('Container records could not be loaded. Please try again.');
    // The additive notes migration is prepared locally and may not be applied yet.
    const notesMissing = ['42P01', 'PGRST205'].includes(notes.error?.code ?? '');
    if (notes.error && !notesMissing) throw new Error('Internal notes could not be loaded. Please try again.');
    const historyMissing = ['42P01', 'PGRST205'].includes(history.error?.code ?? '');
    if (history.error && !historyMissing) throw new Error('Fulfillment history could not be loaded. Please try again.');
    return { data: {
      order: order.data as AdminOrderDetails,
      containerEvents: (events.data ?? []) as OrderContainerEvent[],
      note: notes.data?.note ?? '', notesAvailable: !notesMissing,
      history: history.data ?? [], trackingAvailable: !historyMissing,
    } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to load this order.' };
  }
}

export async function saveOrderNote(id: string, note: string) {
  try {
    const db = await requireAdmin();
    validId(id);
    if (typeof note !== 'string' || note.length > 5000) throw new Error('Keep internal notes within 5,000 characters.');
    const result = await db.from('admin_order_notes').upsert({ order_id: id, note: note.trim() }, { onConflict: 'order_id' });
    if (result.error) throw new Error('The internal note could not be saved. Please try again.');
    return { saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save the internal note.' };
  }
}

export async function updateOrderFromModal(id: string, status: string) {
  try {
    validId(id);
    const form = new FormData();
    form.set('id', id);
    form.set('status', status);
    // Every caller, including older forms, uses the same transactional workflow.
    await setOrderStatus(form);
    return { saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'The order could not be updated.' };
  }
}
