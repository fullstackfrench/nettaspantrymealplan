import type { AdminDashboardData } from '@/lib/admin-dashboard';

export default function CustomerMixChart({ mix }: { mix: AdminDashboardData['customerMix'] }) {
  const total = mix.newCustomers + mix.repeatCustomers;
  const repeatPercent = total ? Math.round((mix.repeatCustomers / total) * 100) : 0;
  return (
    <section className="admin-card p-5 sm:p-6" aria-labelledby="customer-mix-heading">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-moss-600">Customer loyalty</p>
      <h3 id="customer-mix-heading" className="mt-1 font-display text-xl font-bold text-brand-plum">New vs repeat</h3>
      <p className="mt-2 text-sm leading-6 text-ink/55">Customers grouped by paid-order history, all time.</p>
      {total === 0 ? (
        <p className="mt-6 rounded-panel border border-dashed border-brand-plum/15 bg-cream/50 px-5 py-12 text-center text-sm leading-6 text-ink/55">Paid-order customer insights will appear after the first completed payment.</p>
      ) : (
        <div className="mt-7 grid gap-6 min-[420px]:grid-cols-[9rem_1fr] min-[420px]:items-center">
          <div className="relative mx-auto h-36 w-36 rounded-full" style={{ background: `conic-gradient(#682952 0 ${repeatPercent}%, #A88B43 ${repeatPercent}% 100%)` }} role="img" aria-label={`${repeatPercent}% repeat customers`}>
            <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white"><strong className="text-2xl text-brand-plum">{repeatPercent}%</strong><span className="text-xs font-medium text-ink/50">repeat</span></div>
          </div>
          <dl className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-control bg-cream px-4 py-3"><dt className="flex items-center gap-2 text-sm font-bold text-brand-plum"><span className="h-3 w-3 rounded-sm bg-brand-gold" />New customers</dt><dd className="font-bold text-brand-plum">{mix.newCustomers}</dd></div>
            <div className="flex items-center justify-between gap-3 rounded-control bg-cream px-4 py-3"><dt className="flex items-center gap-2 text-sm font-bold text-brand-plum"><span className="h-3 w-3 rounded-sm bg-brand-plum" />Repeat customers</dt><dd className="font-bold text-brand-plum">{mix.repeatCustomers}</dd></div>
          </dl>
        </div>
      )}
      <p className="mt-5 text-xs leading-5 text-ink/50">Repeat means more than one paid order. Account ID is used first; normalized email is only a fallback for guest analytics.</p>
    </section>
  );
}
