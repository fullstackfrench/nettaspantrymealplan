import Link from 'next/link';
import type { AdminDashboardData } from '@/lib/admin-dashboard';

export default function OrdersTrendChart({ trend, range }: Pick<AdminDashboardData, 'trend' | 'range'>) {
  const max = Math.max(...trend.map((point) => point.orders), 1);
  const hasOrders = trend.some((point) => point.orders > 0);
  const points = trend.map((point, index) => {
    const x = trend.length === 1 ? 50 : (index / (trend.length - 1)) * 100;
    const y = 88 - (point.orders / max) * 72;
    return { ...point, x, y };
  });

  return (
    <section className="admin-card p-5 sm:p-6" aria-labelledby="orders-trend-heading">
      <div className="flex flex-col gap-4 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Order activity</p>
          <h3 id="orders-trend-heading" className="mt-1 font-display text-xl font-bold text-brand-plum">Orders over time</h3>
          <p className="mt-2 text-sm text-ink/55">All created orders, including pending and canceled orders.</p>
        </div>
        <nav className="flex gap-1 rounded-full bg-cream p-1" aria-label="Order trend range">
          {[7, 30, 90].map((days) => (
            <Link key={days} href={`/admin?range=${days}`} aria-current={range === days ? 'page' : undefined} className={`rounded-full px-3 py-2 text-xs font-bold transition ${range === days ? 'bg-brand-plum text-white' : 'text-brand-plum hover:bg-brand-plum/5'}`}>
              {days} days
            </Link>
          ))}
        </nav>
      </div>

      {!hasOrders ? (
        <div className="mt-6 flex min-h-64 items-center justify-center rounded-panel border border-dashed border-brand-plum/15 bg-cream/50 px-5 text-center text-sm leading-6 text-ink/55">
          No orders were created during this period. Try a wider range or check back after new orders arrive.
        </div>
      ) : (
        <div className="mt-6">
          <svg viewBox="0 0 100 100" role="img" aria-labelledby="trend-title trend-description" className="h-64 w-full overflow-visible" preserveAspectRatio="none">
            <title id="trend-title">Orders created over the last {range} days</title>
            <desc id="trend-description">Daily order counts range from zero to {max}.</desc>
            {[16, 40, 64, 88].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} vectorEffect="non-scaling-stroke" className="stroke-brand-plum/10" />)}
            <polygon points={`0,88 ${points.map((point) => `${point.x},${point.y}`).join(' ')} 100,88`} className="fill-brand-plum/10" />
            <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-plum" />
            {points.filter((_, index) => range <= 7 || index % Math.ceil(range / 12) === 0 || index === points.length - 1).map((point) => (
              <circle key={point.date} cx={point.x} cy={point.y} r="1.1" vectorEffect="non-scaling-stroke" strokeWidth="2" className="fill-white stroke-brand-brick"><title>{point.label}: {point.orders} order{point.orders === 1 ? '' : 's'}</title></circle>
            ))}
          </svg>
          <div className="mt-2 flex justify-between text-xs font-medium text-ink/50"><span>{trend[0]?.label}</span><span>{trend[trend.length - 1]?.label}</span></div>
          <p className="sr-only">{trend.map((point) => `${point.label}: ${point.orders}`).join('; ')}</p>
        </div>
      )}
    </section>
  );
}
