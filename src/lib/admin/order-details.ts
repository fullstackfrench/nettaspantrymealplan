import type { Order } from '@/lib/types';

export type AdminOrderDetails = Order & {
  delivery_address_line1?: string | null;
  delivery_address_line2?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  delivery_notes?: string | null;
  needs_meal_selection?: boolean;
  customer_change_id?: string | null;
};

export type OrderContainerEvent = {
  id: string;
  kind: string;
  quantity: number;
  deposit_delta_cents: number;
  note: string | null;
  created_at: string;
};

export type FulfillmentEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  occurred_at: string | null;
  recorded_at: string;
  is_historical: boolean;
};

export type OrderDetailsResult = {
  order: AdminOrderDetails;
  containerEvents: OrderContainerEvent[];
  note: string;
  notesAvailable: boolean;
  history: FulfillmentEvent[];
  trackingAvailable: boolean;
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  unfulfilled: 'Needs Packing', packed: 'Packed', delivered: 'Delivered', canceled: 'Canceled',
};

export function fulfillmentLabel(order: Pick<Order, 'status' | 'fulfillment_status' | 'payment_status'>) {
  if (order.status === 'canceled' || order.fulfillment_status === 'canceled') return 'Canceled';
  if (order.fulfillment_status === 'delivered') return 'Delivered';
  if (!['paid', 'partially_refunded'].includes(order.payment_status)) {
    return order.payment_status === 'processing' ? 'Payment processing' : order.payment_status === 'failed' ? 'Payment failed' : order.payment_status === 'refunded' ? 'Refunded' : 'Awaiting payment';
  }
  return ORDER_STATUS_LABEL[order.fulfillment_status] ?? 'Needs Packing';
}

export function nextFulfillmentStatus(order: AdminOrderDetails) {
  if (!['paid', 'partially_refunded'].includes(order.payment_status) || order.customer_change_id || order.needs_meal_selection || order.status === 'canceled') return null;
  if (order.fulfillment_status === 'unfulfilled') return 'packed';
  if (order.fulfillment_status === 'packed') return 'delivered';
  return null;
}

export const ORDER_PAYMENT_LABEL: Record<string, string> = {
  paid: 'Paid', unpaid: 'Order total · unpaid', processing: 'Order total · processing',
  failed: 'Order total · payment failed', refunded: 'Order total · refunded',
  partially_refunded: 'Order total · partially refunded',
};

export function orderStatusTone(status: string) {
  if (status === 'delivered') return 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15';
  if (status === 'canceled') return 'bg-[#fff1ed] text-[#8f3020]';
  if (status === 'unfulfilled' || status === 'packed') return 'bg-brand-plum/10 text-brand-plum';
  return 'bg-black/5 text-ink/65';
}

export function formatOrderDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const : {}),
  }).format(new Date(value));
}

export function formatDeliveryDate(value: string) {
  // Delivery dates are calendar dates, not midnight UTC timestamps.
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function portionLabel(label: string | null, servings: number | null) {
  if (label?.trim().toLowerCase() === 'half' && servings === 2) return 'Half (serves 2)';
  if (label?.trim().toLowerCase() === 'whole' && servings === 4) return 'Whole (serves 4)';
  if (label && servings) return `${label} (serves ${servings})`;
  if (label) return `${label} · serving count not recorded`;
  if (servings) return `Serves ${servings} · portion name not recorded`;
  return 'Portion not recorded';
}
