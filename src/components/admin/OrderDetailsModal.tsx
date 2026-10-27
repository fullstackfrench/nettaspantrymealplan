'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Dialog from '@/components/ui/Dialog';
import { loadOrderDetails, saveOrderNote, updateOrderFromModal } from '@/app/admin/orders/actions';
import { formatCents } from '@/lib/constants';
import {
  formatDeliveryDate, formatOrderDate, nextFulfillmentStatus, fulfillmentLabel, ORDER_STATUS_LABEL,
  orderStatusTone, portionLabel, type OrderDetailsResult,
} from '@/lib/admin/order-details';

export default function OrderDetailsModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const titleId = useId();
  const router = useRouter();
  const [data, setData] = useState<OrderDetailsResult | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setData(null);
    setError('');
    loadOrderDetails(orderId).then((result) => {
      if (!current) return;
      if (result.data) { setData(result.data); setNote(result.data.note); }
      else setError(result.error || 'This order could not be loaded.');
    }).catch(() => {
      if (current) setError('Unable to connect. Please try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [orderId, attempt]);

  const dirty = Boolean(data?.notesAvailable && note !== data.note);
  function close() {
    if (busy) return;
    if (dirty && !window.confirm('Discard your unsaved internal note?')) return;
    onClose();
  }
  async function changeStatus(status: string) {
    if (busy || !data?.trackingAvailable) return;
    if (status === 'canceled' && !window.confirm('Cancel this unpaid order? Any open payment checkout will be expired.')) return;
    if (dirty && !window.confirm('Discard your unsaved internal note and update this order?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await updateOrderFromModal(orderId, status);
      if (!mounted.current) return;
      if (result.error) { setError(result.error); return; }
      setNotice('Order updated.');
      setAttempt((value) => value + 1);
      router.refresh();
    } catch {
      if (mounted.current) setError('The update could not be confirmed. Reload the details before trying again.');
    } finally { if (mounted.current) setBusy(false); }
  }
  async function saveNote() {
    if (busy || !dirty) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await saveOrderNote(orderId, note);
      if (!mounted.current) return;
      if (result.error) { setError(result.error); return; }
      setData((value) => value ? { ...value, note: note.trim() } : value);
      setNote(note.trim()); setNotice('Internal note saved.');
    } catch {
      if (mounted.current) setError('The internal note could not be saved. Please try again.');
    } finally { if (mounted.current) setBusy(false); }
  }

  const order = data?.order;
  const next = order ? nextFulfillmentStatus(order) : null;
  return (
    <Dialog titleId={titleId} onClose={close}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-plum/10 bg-white p-4 sm:px-7 sm:py-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Order details</p>
          <h2 id={titleId} className="mt-1 break-words font-display text-2xl font-bold text-brand-plum">
            {order?.contact_name || order?.customers?.full_name || 'Customer order'}
          </h2>
          <p className="mt-1 text-xs text-ink/55">Order {orderId.slice(0, 8)}</p>
        </div>
        <button type="button" autoFocus onClick={close} disabled={busy} aria-label="Close order details"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-2xl text-brand-plum transition hover:bg-brand-plum/10 disabled:opacity-50">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-7" aria-busy={loading || busy}>
        {loading && <p role="status" className="py-8 text-center text-ink/60">Loading order details…</p>}
        {error && <div role="alert" className="mb-5 rounded-control bg-clay-100 p-4 text-sm text-brand-brick">
          <p>{error}</p>
          {!loading && <button type="button" disabled={busy || dirty} onClick={() => setAttempt((value) => value + 1)} className="admin-secondary-button mt-3">Reload details</button>}
        </div>}
        {notice && <p role="status" className="mb-5 rounded-control bg-moss-50 p-4 text-sm text-moss-700">{notice}</p>}
        {!loading && order && data && <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink/65">{formatOrderDate(order.created_at, true)} · {order.order_type === 'subscription' ? 'Subscription' : 'One-time'}</p>
            <span className={`status-badge ${orderStatusTone(order.fulfillment_status)}`}>{fulfillmentLabel(order)}</span>
          </div>
          <Section title="Customer & delivery">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Field label="Customer">{order.contact_name || order.customers?.full_name || 'Name not recorded'}</Field>
              <Field label="Email">{order.contact_email || order.customers?.email || 'Not recorded'}</Field>
              <Field label="Phone">{order.customers?.phone || 'Not recorded'}</Field>
              <Field label="Scheduled delivery">{order.delivery_date ? formatDeliveryDate(order.delivery_date) : 'Not scheduled'}</Field>
              <Field label="Saved delivery address">
                {order.delivery_address_line1 ? <address className="not-italic">
                  <span className="block">{order.delivery_address_line1}</span>
                  {order.delivery_address_line2 && <span className="block">{order.delivery_address_line2}</span>}
                  <span className="block">{[order.delivery_city, order.delivery_state || 'NC', order.delivery_zip].filter(Boolean).join(', ')}</span>
                </address> : 'No delivery address was saved with this order.'}
              </Field>
              <Field label="Saved delivery instructions">{order.delivery_notes || 'None recorded'}</Field>
            </dl>
            <p className="mt-4 text-xs text-ink/50">Phone is from the current customer profile. The address and instructions above come from this order.</p>
          </Section>
          <Section title="Meals ordered">
            {order.needs_meal_selection && <p className="mb-3 rounded-control bg-cream p-3 text-sm">This subscription order still needs meal selections.</p>}
            {order.order_items?.length ? <ul className="divide-y divide-brand-plum/10">
              {order.order_items.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="font-bold text-brand-plum">{item.meal_name_snapshot || 'Meal name not recorded'}</p>
                  <p className="mt-1 text-sm text-ink/65">{portionLabel(item.size_label_snapshot, item.servings_snapshot)}</p>
                  <p className="mt-1 text-sm text-ink/65">Quantity: {item.quantity} · {order.order_type === 'subscription' && item.unit_price_cents === 0 ? 'Included in subscription' : `${formatCents(item.unit_price_cents)} each`}</p>
                </div>
                <p className="text-sm font-bold text-brand-plum">{order.order_type === 'subscription' && item.unit_price_cents === 0 ? 'Included' : formatCents(item.quantity * item.unit_price_cents)}</p>
              </li>)}
            </ul> : <p className="text-sm text-ink/60">No meal selections recorded.</p>}
          </Section>
          <Section title="Payment summary">
            <dl className="space-y-2 text-sm">
              <Money label={order.order_type === 'subscription' ? 'Subscription subtotal' : 'Meal subtotal'} cents={order.subtotal_cents} />
              <Money label="Sales tax" cents={order.tax_cents ?? 0} />
              <Money label="Refundable container deposit (historical)" cents={order.deposit_cents} />
              <Money label="One-time glass-container deposit" cents={order.glass_fee_cents ?? 0} />
              <Money label="Delivery fee" cents={order.delivery_fee_cents} />
              <div className="border-t border-brand-plum/10 pt-3 font-bold text-brand-plum"><Money label="Order total" cents={order.total_cents} /></div>
              {order.payment_status === 'paid' && <Money label="Total paid" cents={order.total_cents} />}
              <Field label="Payment status">{order.payment_status.replaceAll('_', ' ')}</Field>
              {order.paid_at && <Field label="Payment confirmed">{formatOrderDate(order.paid_at, true)}</Field>}
            </dl>
            {['refunded', 'partially_refunded'].includes(order.payment_status) && <p className="mt-3 text-xs text-ink/60">The order total is shown above. A net paid amount is not available in this view; check the existing payment/refund records.</p>}
          </Section>
          <Section title="Fulfillment">
            <p className="text-sm text-ink/65">Current status: <strong className="text-brand-plum">{fulfillmentLabel(order)}</strong></p>
            {order.status !== 'canceled' && <ol aria-label="Fulfillment milestones" className="mt-4 grid gap-3 sm:grid-cols-3">
              <li className={`rounded-control border p-3 text-sm ${order.confirmed_at || order.paid_at || ['paid', 'partially_refunded'].includes(order.payment_status) ? 'border-brand-gold/40 bg-cream' : 'border-brand-plum/10'}`}>
                <p className="font-bold text-brand-plum">1. Needs Packing</p>
                <p className="mt-1 text-xs leading-5 text-ink/60">{order.confirmed_at || order.paid_at ? formatOrderDate((order.confirmed_at || order.paid_at)!, true) : ['paid', 'partially_refunded'].includes(order.payment_status) ? 'Payment confirmed · time not recorded' : 'Payment confirmation not recorded'}</p>
              </li>
              <li className={`rounded-control border p-3 text-sm ${order.fulfillment_status === 'packed' || order.fulfillment_status === 'delivered' ? 'border-brand-gold/40 bg-cream' : 'border-brand-plum/10'}`}>
                <p className="font-bold text-brand-plum">2. Packed</p>
                <p className="mt-1 text-xs leading-5 text-ink/60">{order.packed_at ? formatOrderDate(order.packed_at, true) : 'Time not recorded'}</p>
              </li>
              <li className={`rounded-control border p-3 text-sm ${order.fulfillment_status === 'delivered' ? 'border-moss-600/20 bg-moss-50' : 'border-brand-plum/10'}`}>
                <p className="font-bold text-brand-plum">3. Delivered</p>
                <p className="mt-1 text-xs leading-5 text-ink/60">{order.delivered_at ? formatOrderDate(order.delivered_at, true) : order.fulfillment_status === 'delivered' ? 'Delivered · time not recorded' : 'Not marked delivered'}</p>
              </li>
            </ol>}
            {!data.trackingAvailable && <p role="status" className="mt-3 rounded-control bg-cream p-3 text-sm">Fulfillment tracking is not enabled yet. The approved database migration must be applied before updating orders.</p>}
            {order.customer_change_id && <p className="mt-3 text-sm text-ink/65">An order change is processing. Fulfillment is paused until payment or refund processing finishes.</p>}
            {data.history.length > 0 && <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-bold text-brand-plum">Fulfillment history</summary>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-ink/65">{data.history.map((event) => <li key={event.id}>
                {ORDER_STATUS_LABEL[event.to_status] ?? event.to_status} · {event.occurred_at ? formatOrderDate(event.occurred_at, true) : 'Milestone time not recorded'}{event.is_historical && ' · Historical record'}
              </li>)}</ul>
            </details>}
            <div className="mt-4 flex flex-wrap gap-3">
              {next && <button type="button" disabled={busy || !data.trackingAvailable} onClick={() => void changeStatus(next)} className="admin-primary-button">{busy ? 'Saving…' : `Mark as ${ORDER_STATUS_LABEL[next]}`}</button>}
              {!['delivered', 'canceled'].includes(order.fulfillment_status) && ['unpaid', 'failed'].includes(order.payment_status) && !order.customer_change_id && <button type="button" disabled={busy || !data.trackingAvailable} onClick={() => void changeStatus('canceled')} className="admin-danger-action">Cancel unpaid order</button>}
            </div>
          </Section>
          <Section title="Glass containers">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Field label="Containers associated with this order">{order.containers_issued}</Field>
              <Field label="Delivery logging">{data.containerEvents.some((event) => event.kind === 'issued') ? 'Container issuance recorded' : 'No container issuance recorded'}</Field>
              <Field label="Returns recorded on this order">{data.containerEvents.filter((event) => event.kind === 'returned').reduce((total, event) => total + event.quantity, 0)}</Field>
              <Field label="Customer containers currently out">{order.customers?.containers_out ?? 'Not available'}</Field>
              <Money label="Customer refundable deposit currently held" cents={order.customers?.deposit_held_cents ?? 0} />
            </dl>
            <p className="mt-3 text-xs leading-5 text-ink/55">Customer balances include all orders. Returns logged without an order link are managed on the Customers screen.</p>
            {data.containerEvents.length > 0 && <ul className="mt-4 space-y-2 text-xs text-ink/65">{data.containerEvents.map((event) => <li key={event.id}>{event.kind} · {event.quantity} containers · {formatOrderDate(event.created_at, true)}{event.note && ` · ${event.note}`}</li>)}</ul>}
            <Link href="/admin/customers" className="admin-quiet-action mt-3">Manage container returns →</Link>
          </Section>
          <Section title="Internal notes">
            <p className="mb-3 text-xs text-ink/55">For administrators only. Never shown in customer accounts.</p>
            {data.notesAvailable ? <form onSubmit={(event) => { event.preventDefault(); void saveNote(); }}>
              <label className="admin-label">Fulfillment note
                <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} maxLength={5000} rows={4} className="admin-field" />
              </label>
              <button type="submit" disabled={busy || !dirty} className="admin-primary-button mt-3">{busy ? 'Saving…' : 'Save internal note'}</button>
            </form> : <p className="rounded-control bg-cream p-3 text-sm text-ink/65">Internal notes are not available yet. The private notes database migration needs to be approved and applied.</p>}
          </Section>
        </div>}
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-panel border border-brand-plum/10 p-4 sm:p-5"><h3 className="mb-4 font-display text-xl font-bold text-brand-plum">{title}</h3>{children}</section>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="mb-1 text-xs font-bold text-ink/55">{label}</dt><dd className="whitespace-pre-wrap break-words text-ink/80">{children}</dd></div>;
}
function Money({ label, cents }: { label: string; cents: number }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="shrink-0">{formatCents(cents)}</dd></div>;
}
