import CustomerMixChart from '@/components/admin/CustomerMixChart';
import DashboardStatCards from '@/components/admin/DashboardStatCards';
import OrdersTrendChart from '@/components/admin/OrdersTrendChart';
import RecentOrders from '@/components/admin/RecentOrders';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import TopMealsChart from '@/components/admin/TopMealsChart';
import { DASHBOARD_RANGES, getAdminDashboardData, type DashboardRange } from '@/lib/admin-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminHome({ searchParams }: { searchParams?: { range?: string } }) {
  const requestedRange = Number(searchParams?.range);
  const range: DashboardRange = DASHBOARD_RANGES.includes(requestedRange as DashboardRange) ? requestedRange as DashboardRange : 30;
  const dashboard = await getAdminDashboardData(range);
  const credits = await createAdminClient().from('glass_deposit_credits').select('email', { count: 'exact', head: true });
  if (credits.error) throw credits.error;

  return (
    <div className="space-y-7 sm:space-y-8">
      <section aria-labelledby="overview-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Business pulse</p><h2 id="overview-heading" className="mt-1 font-display text-2xl font-bold text-brand-plum">Kitchen overview</h2><p className="mt-2 text-sm leading-6 text-ink/55">Real order, revenue, and customer signals from the pantry.</p></div>
          <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-brand-plum/10 px-3 py-2 text-brand-plum">{dashboard.stats.awaitingFulfillment} awaiting fulfillment</span><span className="rounded-full bg-brand-gold/15 px-3 py-2 text-[#6e5925]">{dashboard.stats.unpaidAttention} payment follow-up</span></div>
        </div>
        <div className="mt-5"><DashboardStatCards stats={dashboard.stats} range={dashboard.range} /></div>
      </section>
      <OrdersTrendChart trend={dashboard.trend} range={dashboard.range} />
      {Boolean(credits.count) && <Link href="/admin/customers" className="admin-card block p-5 text-sm text-brand-plum"><span className="font-bold">{credits.count} prepaid glass-container deposits</span><span className="mt-1 block text-ink/65">View customers with a $50 deposit already paid, including those awaiting account registration.</span></Link>}
      <div className="grid gap-7 lg:grid-cols-2"><TopMealsChart meals={dashboard.topMeals} /><CustomerMixChart mix={dashboard.customerMix} /></div>
      <RecentOrders orders={dashboard.recentOrders} />
    </div>
  );
}
