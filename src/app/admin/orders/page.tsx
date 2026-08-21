import { createAdminClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/constants';
import { setOrderStatus } from '../actions';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

const NEXT_STATUS: Record<string, string | null> = {
  pending: 'paid',
  paid: 'packing',
  packing: 'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered: null,
  canceled: null,
};

const LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid — needs packing',
  packing: 'Packing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  canceled: 'Canceled',
};

export default async function OrdersAdmin() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('orders')
    .select('*, customers(*), order_items(*, meals(name))')
    .order('created_at', { ascending: false })
    .limit(100);

  const orders = (data ?? []) as Order[];

  return (
    <div>
      <h2 className="font-display text-xl font-bold">Orders</h2>
      <p className="mt-1 text-sm text-black/50">
        Move an order along as you work through it. Marking it delivered logs the glass
        containers against that customer automatically.
      </p>

      <div className="mt-5 space-y-4">
        {orders.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-sm text-black/50 ring-1 ring-black/5">
            No orders yet.
          </p>
        )}

        {orders.map((o) => {
          const next = NEXT_STATUS[o.status];
          return (
            <div key={o.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">
                    {o.customers?.full_name ?? o.customers?.email ?? 'Customer'}
                  </div>
                  <div className="text-sm text-black/50">
                    {o.customers?.zip && `ZIP ${o.customers.zip} · `}
                    {o.order_type === 'subscription' ? 'Subscription' : 'One-time'} ·{' '}
                    {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold">{formatCents(o.total_cents)}</div>
                  <div className="text-xs text-black/50">
                    incl. {formatCents(o.deposit_cents)} deposit
                  </div>
                </div>
              </div>

              <ul className="mt-4 space-y-1 text-sm text-black/70">
                {o.order_items?.map((it) => (
                  <li key={it.id}>
                    {it.quantity} × {it.meals?.name ?? 'Meal'}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold">
                  {LABEL[o.status] ?? o.status}
                </span>

                {next && (
                  <form action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={next} />
                    <button className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-black">
                      Mark {LABEL[next].toLowerCase()}
                    </button>
                  </form>
                )}

                {o.status !== 'delivered' && o.status !== 'canceled' && (
                  <form action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="canceled" />
                    <button className="text-xs text-clay-500 hover:underline">Cancel</button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
