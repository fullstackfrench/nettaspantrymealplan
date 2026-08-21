import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSessionClient, createAdminClient } from '@/lib/supabase/server';
import { signOut } from '../auth/actions';
import { formatCents } from '@/lib/constants';
import type { Customer, Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const supabase = createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/account');

  // RLS ("customer reads self") already scopes this to the signed-in user.
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle<Customer>();

  // Past orders can reference a meal that's since been hidden, which the
  // public "active meals only" RLS policy wouldn't resolve — so this uses the
  // service role, explicitly scoped to just this customer's own orders.
  let orders: Order[] = [];
  if (customer) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('orders')
      .select('*, order_items(*, meals(name))')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    orders = (data ?? []) as Order[];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-col gap-4 border-b border-brand-plum/10 pb-7 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Netta&apos;s Pantry</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-brand-plum sm:text-4xl">Your account</h1>
          <p className="mt-2 text-sm text-ink/55">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="admin-secondary-button">Sign out</button>
        </form>
      </div>

      <div className="mt-9 flex items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">From your table</p><h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Order history</h2></div>
        {orders.length > 0 && <span className="text-sm text-ink/50">{orders.length} order{orders.length === 1 ? '' : 's'}</span>}
      </div>

      {orders.length === 0 && (
        <div className="admin-empty-state mt-5">
          <p className="font-display text-xl font-bold text-brand-plum">Your first meal is waiting</p>
          <p className="mx-auto mt-2 max-w-sm">Once you place an order, its meals, total, and fulfillment status will appear here.</p>
          <Link href="/menu" className="admin-primary-button mt-5">Browse this week&apos;s menu</Link>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {orders.map((o) => (
          <article key={o.id} className="admin-card overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-brand-plum/10 bg-white px-5 py-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
              <div>
                <div className="text-sm font-bold text-brand-plum">{new Date(o.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <div className="mt-1 text-xs font-medium text-ink/50">{o.order_type === 'subscription' ? 'Weekly subscription' : 'One-time order'}</div>
              </div>
              <div className="flex items-center justify-between gap-4 min-[420px]:justify-end">
                <StatusBadge status={o.status} />
                <div className="text-lg font-bold text-brand-plum">{formatCents(o.total_cents)}</div>
              </div>
            </div>
            <ul className="space-y-2 px-5 py-4 text-sm text-ink/70">
              {o.order_items?.map((it) => (
                <li key={it.id} className="flex gap-3"><span className="font-bold text-brand-gold">{it.quantity}×</span><span>{it.meals?.name ?? 'Meal'}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment', paid: 'Paid', packing: 'Being packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', canceled: 'Canceled',
};

function StatusBadge({ status }: { status: string }) {
  const color = status === 'delivered' ? 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15' : status === 'canceled' ? 'bg-[#fff1ed] text-[#8f3020]' : status === 'pending' ? 'bg-brand-gold/15 text-[#6e5925]' : 'bg-brand-plum/10 text-brand-plum';
  return <span className={`status-badge ${color}`}>{STATUS_LABEL[status] ?? status}</span>;
}
