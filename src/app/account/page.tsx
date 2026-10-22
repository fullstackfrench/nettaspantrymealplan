import { redirect } from 'next/navigation';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import { signOut } from '../auth/actions';
import { afterAuth } from '../auth/after-auth';
import { getActiveSubscriptionPlans, getWeeklyMenuMeals } from '@/lib/catalog';
import AccountDashboard from '@/components/account/AccountDashboard';
export const dynamic = 'force-dynamic';
export default async function AccountPage({
  searchParams,
}: {
  searchParams: { notice?: string };
}) {
  const {
    data: { user },
  } = await createSessionClient().auth.getUser();
  if (!user) redirect('/login?redirect=/account');
  await afterAuth(user);
  const admin = createAdminClient();
  const { data: customer, error } = await admin
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();
  if (error || !customer)
    throw new Error('Unable to load your customer account.');
  const [orders, subscriptions, changes, menu, meals, plans] =
    await Promise.all([
      admin
        .from('orders')
        .select('*,order_items(*,meals(name))')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      admin
        .from('subscriptions')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false }),
      admin
        .from('customer_order_changes')
        .select('id,order_id,status')
        .eq('customer_id', customer.id)
        .in('status', ['pending', 'waiting_payment']),
      admin
        .from('weekly_menus')
        .select('id,week_start')
        .eq('is_published', true)
        .gt(
          'week_start',
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date()),
        )
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getWeeklyMenuMeals(),
      getActiveSubscriptionPlans(),
    ]);
  if (orders.error || subscriptions.error || changes.error || menu.error)
    throw new Error('Unable to load your orders. Please try again shortly.');
  const subs = subscriptions.data || [];
  const choices = subs.length
    ? await admin
        .from('subscription_week_choices')
        .select('subscription_id,menu_id,items')
        .in(
          'subscription_id',
          subs.map((sub) => sub.id),
        )
    : { data: [], error: null };
  if (choices.error) throw new Error('Unable to load upcoming meal choices.');
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-brand-plum">
            Your account
          </h1>
          <p className="mt-2 text-ink/60">{user.email}</p>
        </div>
        <form action={signOut}>
          <button className="admin-secondary-button">Sign out</button>
        </form>
      </div>
      {searchParams.notice === 'payment' && (
        <p role="status" className="mb-5 rounded-control bg-moss-50 p-4">
          Thank you. Your payment is being confirmed; refresh shortly to see the
          updated order.
        </p>
      )}
      <AccountDashboard
        customer={customer}
        orders={orders.data || []}
        subscriptions={subs}
        changes={changes.data || []}
        menu={menu.data}
        meals={meals}
        plans={plans}
        choices={choices.data || []}
      />
    </div>
  );
}
