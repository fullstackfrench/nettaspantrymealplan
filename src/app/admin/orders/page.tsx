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
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Fulfillment queue</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Orders</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/55">
        Move an order along as you work through it. Marking it delivered logs the glass
        containers against that customer automatically.
      </p>

      <div className="mt-5 space-y-4">
        {orders.length === 0 && (
          <p className="admin-empty-state">No orders yet. New customer orders will appear here for fulfillment.</p>
        )}

        {orders.map((o) => {
          const next = NEXT_STATUS[o.status];
          return (
            <article key={o.id} className="admin-card overflow-hidden">
              <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-bold text-brand-plum">
                    {o.customers?.full_name ?? o.customers?.email ?? 'Customer'}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-ink/55">
                    {o.customers?.zip && `ZIP ${o.customers.zip} · `}
                    {o.order_type === 'subscription' ? 'Subscription' : 'One-time'} ·{' '}
                    {new Date(o.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="text-left min-[420px]:text-right">
                  <div className="text-lg font-bold text-brand-plum">{formatCents(o.total_cents)}</div>
                  <div className="mt-1 text-xs text-ink/50">
                    incl. {formatCents(o.deposit_cents)} deposit
                  </div>
                </div>
              </div>

              <ul className="mt-5 space-y-2 rounded-control bg-cream/70 p-4 text-sm text-ink/70">
                {o.order_items?.map((it) => (
                  <li key={it.id}>
                    <span className="mr-2 font-bold text-brand-gold">{it.quantity}×</span>{it.meals?.name ?? 'Meal'}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-brand-plum/10 pt-4">
                <span className={`status-badge ${statusTone(o.status)}`}>
                  {LABEL[o.status] ?? o.status}
                </span>

                {next && (
                  <form action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value={next} />
                    <button className="admin-primary-button px-4 text-xs">
                      Mark {LABEL[next].toLowerCase()}
                    </button>
                  </form>
                )}

                {o.status !== 'delivered' && o.status !== 'canceled' && (
                  <form action={setOrderStatus}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="canceled" />
                    <button className="admin-danger-action text-xs">Cancel order</button>
                  </form>
                )}
              </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function statusTone(status: string) {
  if (status === 'delivered') return 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15';
  if (status === 'canceled') return 'bg-[#fff1ed] text-[#8f3020]';
  if (status === 'paid' || status === 'packing') return 'bg-brand-plum/10 text-brand-plum';
  if (status === 'out_for_delivery') return 'bg-brand-gold/15 text-[#6e5925]';
  return 'bg-black/5 text-ink/65';
}
