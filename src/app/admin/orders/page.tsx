import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/require-admin';
import OrdersList from '@/components/admin/OrdersList';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FILTERS = [
  { id: 'active', label: 'Needs attention' },
  { id: 'all', label: 'All orders' },
  { id: 'paid', label: 'Needs Packing' },
  { id: 'packing', label: 'Packed' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'canceled', label: 'Canceled' },
] as const;
const PAGE_SIZE = 25;
function ordersHref(view: string, type: string, page = 1) {
  const params = new URLSearchParams({ view, type });
  if (page > 1) params.set('page', String(page));
  return `/admin/orders?${params}`;
}

export default async function OrdersAdmin({ searchParams }: {
  searchParams: { view?: string; type?: string; page?: string };
}) {
  const view = FILTERS.some((filter) => filter.id === searchParams.view) ? searchParams.view! : 'active';
  const type = ['one_time', 'subscription'].includes(searchParams.type ?? '') ? searchParams.type! : 'all';
  const requestedPage = Number(searchParams.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const supabase = await requireAdmin();
  let query = supabase.from('orders')
    .select('*, customers(*), order_items(*, meals(name))', { count: 'exact' });
  if (view === 'active') query = query.not('fulfillment_status', 'in', '(delivered,canceled)');
  else if (view === 'paid') query = query.eq('fulfillment_status', 'unfulfilled').in('payment_status', ['paid', 'partially_refunded']);
  else if (view === 'packing') query = query.eq('fulfillment_status', 'packed');
  else if (view !== 'all') query = query.eq('fulfillment_status', view);
  if (type !== 'all') query = query.eq('order_type', type);
  if (view === 'active') query = query.order('delivery_date', { ascending: true, nullsFirst: false });
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new Error('Orders could not be loaded. Please refresh and try again.');
  const orders = (data ?? []) as Order[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Fulfillment queue</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Orders</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/55">
        Active orders appear first, with scheduled deliveries at the top. Select an order
        to see its meals, saved delivery details, and fulfillment progress. Awaiting-payment orders are included.
      </p>

      <nav aria-label="Filter orders by status" className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link key={filter.id} href={ordersHref(filter.id, type)}
            aria-current={view === filter.id ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 py-2.5 text-sm font-bold transition ${view === filter.id ? 'bg-brand-plum text-white shadow-soft' : 'border border-brand-plum/15 bg-white text-brand-plum hover:bg-brand-plum/5'}`}>
            {filter.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Filter orders by type" className="mt-3 flex flex-wrap gap-2">
        {([['all', 'All types'], ['one_time', 'One-time'], ['subscription', 'Subscription']] as const).map(([value, label]) => (
          <Link key={value} href={ordersHref(view, value)} aria-current={type === value ? 'page' : undefined}
            className={`admin-quiet-action ${type === value ? 'bg-brand-plum/10' : ''}`}>{label}</Link>
        ))}
        <Link href="/admin/holidays" className="admin-quiet-action">Holiday orders →</Link>
      </nav>
      <p className="mt-4 text-sm text-ink/55" role="status">
        {total} matching order{total === 1 ? '' : 's'}{total > 0 && ` · Page ${page} of ${pages}`}
      </p>

      <div className="mt-3 space-y-3">
        {orders.length === 0 && (
          <div className="admin-empty-state">
            <p>{page > pages ? 'No orders on this page.' : view === 'active' ? 'No active orders need attention.' : 'No orders match these filters.'}</p>
            <Link href={ordersHref('all', 'all')} className="admin-quiet-action mt-2">View all orders</Link>
          </div>
        )}

        <OrdersList orders={orders} />
      </div>
      {pages > 1 && <nav aria-label="Order pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {page > 1 ? <Link href={ordersHref(view, type, page - 1)} className="admin-secondary-button">Previous</Link> : <span />}
        <span className="text-sm text-ink/55">Page {page} of {pages}</span>
        {page < pages ? <Link href={ordersHref(view, type, page + 1)} className="admin-secondary-button">Next</Link> : <span />}
      </nav>}
    </div>
  );
}
