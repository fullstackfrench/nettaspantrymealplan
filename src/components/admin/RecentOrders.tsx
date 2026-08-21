import Link from 'next/link';
import { formatCents } from '@/lib/constants';
import type { AdminDashboardData } from '@/lib/admin-dashboard';

const PAYMENT_LABELS: Record<string, string> = { unpaid: 'Unpaid', processing: 'Processing', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Partially refunded' };
const FULFILLMENT_LABELS: Record<string, string> = { unfulfilled: 'Unfulfilled', packing: 'Packing', out_for_delivery: 'Out for delivery', delivered: 'Delivered', canceled: 'Canceled' };

export default function RecentOrders({ orders }: { orders: AdminDashboardData['recentOrders'] }) {
  return <section aria-labelledby="recent-orders-heading">
    <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-end min-[420px]:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">What just came in</p><h3 id="recent-orders-heading" className="mt-1 font-display text-2xl font-bold text-brand-plum">Recent orders</h3><p className="mt-2 text-sm text-ink/55">The 10 newest orders across every payment and fulfillment status.</p></div>
      <Link href="/admin/orders" className="admin-secondary-button self-start">View all orders <span aria-hidden className="ml-2">→</span></Link>
    </div>
    {orders.length === 0 ? <p className="admin-empty-state mt-5">No orders yet. New orders will appear here as soon as customers begin checkout.</p> :
      <div className="mt-5 grid gap-3">{orders.map((order) => <article key={order.id} className="admin-card p-4 sm:p-5"><div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(10rem,.8fr)_auto] md:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h4 className="truncate font-bold text-brand-plum">{order.customerName}</h4><time dateTime={order.createdAt} className="text-xs font-medium text-ink/50">{formatOrderDate(order.createdAt)}</time></div><p className="mt-1 truncate text-sm text-ink/55">{order.customerEmail}</p></div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/65 md:block"><p><span className="font-bold text-brand-plum">{order.orderType === 'subscription' ? 'Subscription' : 'One-time'}</span></p><p className="md:mt-1">{order.mealUnits} meal unit{order.mealUnits === 1 ? '' : 's'} · <strong className="text-brand-plum">{formatCents(order.totalCents)}</strong></p></div>
        <div className="flex flex-wrap gap-2 md:max-w-[14rem] md:justify-end"><span className={`status-badge ${paymentTone(order.paymentStatus)}`}>{PAYMENT_LABELS[order.paymentStatus] ?? humanize(order.paymentStatus)}</span><span className={`status-badge ${fulfillmentTone(order.fulfillmentStatus)}`}>{FULFILLMENT_LABELS[order.fulfillmentStatus] ?? humanize(order.fulfillmentStatus)}</span></div>
      </div></article>)}</div>}
  </section>;
}

function formatOrderDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }).format(new Date(value)); }
function humanize(value: string) { return value.replaceAll('_', ' '); }
function paymentTone(status: string) {
  if (status === 'paid') return 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15';
  if (status === 'failed' || status === 'refunded') return 'bg-[#fff1ed] text-[#8f3020]';
  if (status === 'partially_refunded') return 'bg-brand-brick/10 text-[#8f3020]';
  return 'bg-brand-gold/15 text-[#6e5925]';
}
function fulfillmentTone(status: string) {
  if (status === 'delivered') return 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15';
  if (status === 'canceled') return 'bg-[#fff1ed] text-[#8f3020]';
  if (status === 'packing' || status === 'out_for_delivery') return 'bg-brand-plum/10 text-brand-plum';
  return 'bg-black/5 text-ink/65';
}
