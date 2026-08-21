import { redirect } from 'next/navigation';
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
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Your account</h1>
        <form action={signOut}>
          <button className="text-sm text-black/50 hover:text-black">Sign out</button>
        </form>
      </div>

      <p className="mt-1 text-sm text-black/50">{user.email}</p>

      <h2 className="mt-10 font-display text-lg font-bold">Order history</h2>

      {orders.length === 0 && (
        <p className="mt-3 rounded-2xl bg-white p-6 text-sm text-black/50 ring-1 ring-black/5">
          No orders yet.
        </p>
      )}

      <div className="mt-3 space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {new Date(o.created_at).toLocaleDateString()} ·{' '}
                {o.order_type === 'subscription' ? 'Subscription' : 'One-time'}
              </div>
              <div className="text-sm font-semibold">{formatCents(o.total_cents)}</div>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-black/70">
              {o.order_items?.map((it) => (
                <li key={it.id}>
                  {it.quantity} × {it.meals?.name ?? 'Meal'}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-black/50">Status: {o.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
