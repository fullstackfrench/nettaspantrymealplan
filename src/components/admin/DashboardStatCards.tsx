import { formatCents } from '@/lib/constants';
import type { AdminDashboardData } from '@/lib/admin-dashboard';

export default function DashboardStatCards({ stats, range }: Pick<AdminDashboardData, 'stats' | 'range'>) {
  const cards = [
    { label: 'Orders', value: String(stats.orders), detail: `Created in the last ${range} days`, tone: 'bg-brand-plum' },
    { label: 'Paid orders', value: String(stats.paidOrders), detail: `Payment confirmed in the last ${range} days`, tone: 'bg-moss-600' },
    { label: 'Paid revenue', value: formatCents(stats.paidRevenueCents), detail: `Paid orders created in the last ${range} days`, tone: 'bg-brand-gold' },
    { label: 'Repeat customers', value: String(stats.repeatCustomers), detail: 'Customers with 2+ paid orders, all time', tone: 'bg-brand-brick' },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="admin-card relative overflow-hidden p-5 sm:p-6">
          <div className={`absolute inset-y-0 left-0 w-1 ${card.tone}`} aria-hidden />
          <p className="text-sm font-bold text-ink/60">{card.label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-brand-plum">{card.value}</p>
          <p className="mt-2 text-xs leading-5 text-ink/50">{card.detail}</p>
        </article>
      ))}
    </div>
  );
}
