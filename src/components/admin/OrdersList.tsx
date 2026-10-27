'use client';

import { useState } from 'react';
import type { Order } from '@/lib/types';
import { formatCents } from '@/lib/constants';
import { formatDeliveryDate, formatOrderDate, ORDER_PAYMENT_LABEL, fulfillmentLabel, orderStatusTone } from '@/lib/admin/order-details';
import OrderDetailsModal from './OrderDetailsModal';

export default function OrdersList({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div data-orders-list tabIndex={-1} className="space-y-3">
    {orders.map((order) => <article key={order.id} className="admin-card">
      <button type="button" aria-haspopup="dialog" onClick={() => setSelected(order.id)}
        className="flex min-h-24 w-full flex-wrap items-center justify-between gap-3 rounded-panel p-4 text-left hover:bg-brand-plum/[0.025] sm:flex-nowrap sm:p-5">
        <span className="min-w-0">
          <span className="block break-words font-bold text-brand-plum">{order.contact_name || order.customers?.full_name || order.contact_email || order.customers?.email || 'Customer'}</span>
          <span className="mt-1 block text-xs leading-6 text-ink/55 sm:text-sm">
            {(order.delivery_zip || order.customers?.zip) && `ZIP ${order.delivery_zip || order.customers?.zip} · `}
            {order.order_type === 'subscription' ? 'Subscription' : 'One-time'} · <time dateTime={order.created_at}>{formatOrderDate(order.created_at)}</time>
          </span>
          {order.delivery_date && <span className="block text-xs text-ink/65">Scheduled delivery: <time dateTime={order.delivery_date}>{formatDeliveryDate(order.delivery_date)}</time></span>}
        </span>
        <span className="flex shrink-0 items-center gap-4">
          <span className="text-right">
            <span className="block font-bold text-brand-plum">{formatCents(order.total_cents)}</span>
            <span className="mt-0.5 block text-xs text-ink/55">{ORDER_PAYMENT_LABEL[order.payment_status] ?? 'Order total'}</span>
            <span className={`status-badge mt-2 ${orderStatusTone(order.fulfillment_status)}`}>{fulfillmentLabel(order)}</span>
          </span>
          <span aria-hidden="true" className="text-brand-gold">⌄</span>
        </span>
      </button>
    </article>)}
    {selected && <OrderDetailsModal key={selected} orderId={selected} onClose={() => setSelected(null)} />}
  </div>;
}
