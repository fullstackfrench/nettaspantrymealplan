'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  changeOrder,
  saveProfile,
  manageSubscription,
  saveWeeklyChoices,
  retryOrderChange,
  discardOrderChange,
  payOrder,
  openBillingPortal,
} from '@/app/account/actions';
import {
  canCancelOrder,
  canEditOrder,
  orderChangeDeadline,
  ORDER_CHANGE_POLICY,
} from '@/lib/account/policy';
import { getSubscriptionKind, subscriptionMix } from '@/lib/subscription-mix';
import { getAvailableMealSizes } from '@/lib/meal-availability';
import { formatCents } from '@/lib/constants';
import type {
  Customer,
  Meal,
  Order,
  Subscription,
  PublicSubscriptionPlan,
} from '@/lib/types';

type AccountOrder = Order & {
  delivery_address_line1?: string;
  delivery_address_line2?: string;
  delivery_city?: string;
  delivery_zip?: string;
  delivery_notes?: string;
  customer_change_id?: string;
  needs_meal_selection?: boolean;
};
type Choice = {
  meal_id: string;
  meal_size_id: string;
  quantity: number;
  label?: string;
};
type Change = { id: string; order_id: string; status: string };
type AccountSubscription = Subscription & {
  cancel_at_period_end?: boolean;
  resumes_at?: string | null;
};
const labels: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  packing: 'Being prepared',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  canceled: 'Canceled',
};

export default function AccountDashboard({
  customer,
  orders,
  subscriptions,
  meals,
  plans,
  menu,
  choices,
  changes,
}: {
  customer: Customer;
  orders: AccountOrder[];
  subscriptions: AccountSubscription[];
  meals: Meal[];
  plans: PublicSubscriptionPlan[];
  menu: { id: string; week_start: string } | null;
  choices: { subscription_id: string; menu_id: string; items: Choice[] }[];
  changes: Change[];
}) {
  const feedback = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'current' | 'past'>('current');
  const [editing, setEditing] = useState<string | null>(null);
  async function run(
    task: () => Promise<{ error?: string; message?: string; url?: string }>,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await task();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setNotice(result.message || 'Saved.');
      setEditing(null);
      router.refresh();
    } catch {
      setError('Unable to complete this request. Please try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        feedback.current?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        }),
      );
    }
  }
  const listed = orders.filter((order) =>
    tab === 'past'
      ? ['delivered', 'canceled'].includes(order.status)
      : !['delivered', 'canceled'].includes(order.status),
  );
  return (
    <div className="space-y-8">
      <p className="rounded-control bg-cream p-4 text-sm leading-6 text-ink/75">
        {ORDER_CHANGE_POLICY}
      </p>
      <div ref={feedback}>
        {error && (
          <p
            role="alert"
            className="rounded-control bg-clay-100 p-4 text-brand-brick"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-control bg-moss-50 p-4 text-moss-700"
          >
            {notice}
          </p>
        )}
      </div>
      <section>
        <h2 className="font-display text-2xl text-brand-plum">
          Delivery details
        </h2>
        <p className="mt-2 text-sm text-ink/65">
          {customer.glass_fee_paid_at ? 'Glass-container deposit: already paid. You will not be charged another $50 deposit.' : 'A one-time, non-refundable $50 glass-container deposit applies to your first meal order.'}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void run(() => saveProfile(data));
          }}
          className="admin-card mt-4 space-y-4 p-5"
        >
          <AddressFields customer={customer} />
          <button disabled={busy} className="admin-primary-button">
            Save delivery details
          </button>
          <p className="admin-help">
            These details apply to future orders. Use Edit order to change an
            existing order’s address.
          </p>
        </form>
        <Link href="/account/password" className="admin-quiet-action mt-3">
          Change password
        </Link>
      </section>
      <section>
        <h2 className="font-display text-2xl text-brand-plum">Your orders</h2>
        <div className="my-4 flex gap-3">
          {(['current', 'past'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              className={
                tab === value
                  ? 'admin-primary-button'
                  : 'admin-secondary-button'
              }
              onClick={() => setTab(value)}
            >
              {value === 'current' ? 'Current orders' : 'Past orders'}
            </button>
          ))}
        </div>
        {listed.length === 0 && (
          <p className="admin-empty-state">
            No {tab} orders.{' '}
            <Link href="/menu" className="underline">
              Browse the menu
            </Link>
          </p>
        )}
        <div className="space-y-4">
          {listed.map((order) => {
            const pending = changes.find(
              (change) =>
                change.id === order.customer_change_id &&
                ['pending', 'waiting_payment'].includes(change.status),
            );
            return (
              <article key={order.id} className="admin-card space-y-4 p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-brand-plum">
                      Order {order.id.slice(0, 8)}
                    </h3>
                    <p className="text-sm text-ink/60">
                      Placed {new Date(order.created_at).toLocaleString()} ·{' '}
                      {order.order_type === 'subscription'
                        ? 'Weekly subscription'
                        : 'One-time box'}
                    </p>
                  </div>
                  <p className="font-bold">
                    {labels[order.status] || order.status} ·{' '}
                    {formatCents(order.total_cents)}
                    {Boolean(order.tax_cents) && <span className="block text-xs font-normal">Includes {formatCents(order.tax_cents!)} sales tax</span>}
                  </p>
                </div>
                {order.needs_meal_selection && (
                  <p className="rounded-control bg-cream p-3 text-sm">
                    {canEditOrder(order)
                      ? 'Your renewal needs meal selections. Use Edit order to choose the meals included in your plan.'
                      : 'Your renewal needs meal selections. Please contact Chef Netta to complete this order.'}
                  </p>
                )}
                <ul className="space-y-1 text-sm">
                  {order.order_items?.map((item) => (
                    <li key={item.id}>
                      {item.quantity} ×{' '}
                      {item.meal_name_snapshot || item.meals?.name || 'Meal'}
                      {item.size_label_snapshot &&
                        ` — ${item.size_label_snapshot}`}
                    </li>
                  ))}
                </ul>
                {order.delivery_address_line1 && (
                  <p className="text-sm text-ink/60">
                    Delivery: {order.delivery_address_line1},{' '}
                    {order.delivery_city}, NC {order.delivery_zip}
                  </p>
                )}
                {canCancelOrder(order) && (
                  <p className="text-sm text-ink/60">
                    Cancellation deadline:{' '}
                    {orderChangeDeadline(order.created_at).toLocaleString()}.
                  </p>
                )}
                {pending ? (
                  <div className="rounded-control bg-cream p-3">
                    <p className="text-sm">
                      An order change is processing. Your original details
                      remain in place until payment or refund processing
                      succeeds.
                    </p>
                    <button
                      disabled={busy}
                      type="button"
                      className="admin-secondary-button mt-3"
                      onClick={() =>
                        void run(() => retryOrderChange(pending.id))
                      }
                    >
                      Continue order change
                    </button>
                    <button
                      disabled={busy}
                      type="button"
                      className="admin-quiet-action mt-3"
                      onClick={() =>
                        void run(() => discardOrderChange(pending.id))
                      }
                    >
                      Discard pending edit
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {order.status === 'pending' && (
                      <button
                        disabled={busy}
                        type="button"
                        className="admin-primary-button"
                        onClick={() => void run(() => payOrder(order.id))}
                      >
                        Pay for order
                      </button>
                    )}
                    {canEditOrder(order) && (
                      <button
                        disabled={busy}
                        type="button"
                        className="admin-secondary-button"
                        onClick={() =>
                          setEditing(editing === order.id ? null : order.id)
                        }
                      >
                        Edit order
                      </button>
                    )}
                    {canCancelOrder(order) && (
                      <button
                        disabled={busy}
                        type="button"
                        className="admin-danger-action"
                        onClick={() => {
                          if (
                            window.confirm(
                              'Cancel this order? Paid orders will be refunded to the original payment method. This does not cancel your subscription.',
                            )
                          ) {
                            const data = new FormData();
                            data.set('order_id', order.id);
                            data.set('request_key', crypto.randomUUID());
                            data.set('operation', 'cancel');
                            void run(() => changeOrder(data));
                          }
                        }}
                      >
                        Cancel order
                      </button>
                    )}
                  </div>
                )}
                {editing === order.id && !pending && (
                  <OrderEditor
                    order={order}
                    customer={customer}
                    meals={meals}
                    busy={busy}
                    onSubmit={(data) => void run(() => changeOrder(data))}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl text-brand-plum">Subscriptions</h2>
        {subscriptions.length === 0 && (
          <p className="admin-empty-state mt-4">
            You have no subscriptions yet.{' '}
            <Link href="/menu" className="underline">
              Choose a weekly plan
            </Link>
          </p>
        )}
        <div className="mt-4 space-y-4">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="admin-card space-y-4 p-5">
              <h3 className="font-bold text-brand-plum">
                {sub.plan_name_snapshot || `${sub.plan_size} meals per week`}
              </h3>
              <p className="text-sm">
                {sub.status}
                {sub.resumes_at &&
                  ` · Resumes ${new Date(sub.resumes_at).toLocaleString()}`}
                {sub.cancel_at_period_end &&
                  ' · Ends after the current billing period'}
              </p>
              {sub.status !== 'canceled' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(sub.status === 'paused' || sub.cancel_at_period_end
                      ? ['resume']
                      : ['skip', 'pause', 'cancel']
                    ).map((operation) => (
                      <button
                        key={operation}
                        disabled={busy}
                        type="button"
                        className="admin-secondary-button"
                        onClick={() => {
                          if (
                            operation === 'cancel' &&
                            !window.confirm(
                              'End your subscription after the current billing period? Existing orders must be canceled separately within 24 hours of placement.',
                            )
                          )
                            return;
                          const data = new FormData();
                          data.set('subscription_id', sub.id);
                          data.set('operation', operation);
                          void run(() => manageSubscription(data));
                        }}
                      >
                        {operation === 'skip'
                          ? 'Skip next week'
                          : operation === 'pause'
                            ? 'Pause subscription'
                            : operation === 'resume'
                              ? 'Resume subscription'
                              : 'Cancel subscription'}
                      </button>
                    ))}
                  </div>
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      data.set('subscription_id', sub.id);
                      data.set('operation', 'plan');
                      void run(() => manageSubscription(data));
                    }}
                  >
                    <label className="admin-label">
                      Change plan
                      <select
                        name="plan_id"
                        className="admin-field"
                        defaultValue={sub.subscription_plan_id || plans[0]?.id}
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} · {formatCents(plan.price_cents)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy} className="admin-secondary-button">
                      Update plan
                    </button>
                  </form>
                  <button
                    disabled={busy}
                    type="button"
                    className="admin-secondary-button"
                    onClick={() => void run(() => openBillingPortal(sub.id))}
                  >
                    Manage subscription payment method &amp; invoices
                  </button>
                  <p className="admin-help">
                    Plan changes apply to future bills. Pausing, skipping, or
                    canceling a subscription does not cancel orders already
                    placed.
                  </p>
                  {menu &&
                    sub.status === 'active' &&
                    !sub.cancel_at_period_end && (
                      <WeeklyEditor
                        key={`${sub.id}:${menu.id}`}
                        sub={sub}
                        menu={menu}
                        meals={meals}
                        initial={
                          choices.find(
                            (choice) =>
                              choice.subscription_id === sub.id &&
                              choice.menu_id === menu.id,
                          )?.items || []
                        }
                        busy={busy}
                        onSubmit={(data) =>
                          void run(() => saveWeeklyChoices(data))
                        }
                      />
                    )}
                </>
              )}
            </div>
          ))}
        </div>
        {customer.stripe_customer_id && (
          <button
            disabled={busy}
            type="button"
            onClick={() => void run(openBillingPortal)}
            className="admin-secondary-button mt-4"
          >
            Manage payment method &amp; invoices
          </button>
        )}
      </section>
    </div>
  );
}
function AddressFields({
  customer,
  order,
}: {
  customer: Customer;
  order?: AccountOrder;
}) {
  const values = {
    full_name: customer.full_name,
    phone: customer.phone,
    address_line1: order?.delivery_address_line1 || customer.address_line1,
    address_line2: order?.delivery_address_line2 || customer.address_line2,
    city: order?.delivery_city || customer.city,
    zip: order?.delivery_zip || customer.zip,
    delivery_notes: order?.delivery_notes || customer.delivery_notes,
  };
  const labels: Record<string, string> = {
    full_name: 'Full name',
    phone: 'Phone',
    address_line1: 'Street address',
    address_line2: 'Apartment / unit (optional)',
    city: 'City',
    zip: 'North Carolina ZIP',
    delivery_notes: 'Delivery instructions (optional)',
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(values).map(([key, value]) => (
        <label key={key} className="admin-label">
          {labels[key]}
          <input
            name={key}
            className="admin-field"
            defaultValue={value || ''}
            required={['address_line1', 'city', 'zip'].includes(key)}
            maxLength={
              key === 'zip' ? 5 : key === 'delivery_notes' ? 2000 : 200
            }
            {...(key === 'zip'
              ? { pattern: '[0-9]{5}', inputMode: 'numeric' as const }
              : {})}
          />
        </label>
      ))}
    </div>
  );
}
function MealChoices({
  meals,
  mode,
  initial,
  onChange,
}: {
  meals: Meal[];
  mode: 'one_time' | 'subscription';
  initial: Choice[];
  onChange: (items: Choice[]) => void;
}) {
  const [items, setItems] = useState<Choice[]>(initial);
  const options = meals.flatMap((meal) =>
    getAvailableMealSizes(meal, mode).map((size) => ({ meal, size })),
  );
  function change(mealId: string, sizeId: string, quantity: number) {
    const next = [
      ...items.filter((item) => item.meal_size_id !== sizeId),
      ...(quantity > 0
        ? [{ meal_id: mealId, meal_size_id: sizeId, quantity }]
        : []),
    ];
    setItems(next);
    onChange(next);
  }
  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-control border border-brand-plum/10 p-3">
      {options.map(({ meal, size }) => (
        <label
          key={size.id}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span>
            {meal.name} — {size.label} · Feeds {size.servings}
            {mode === 'one_time' && ` · ${formatCents(size.price_cents)}`}
          </span>
          <input
            aria-label={`${meal.name}, ${size.label} quantity`}
            className="admin-field mt-0 w-20 shrink-0"
            type="number"
            min={0}
            max={1000}
            step={1}
            value={
              items.find((item) => item.meal_size_id === size.id)?.quantity || 0
            }
            onChange={(event) =>
              change(meal.id, size.id, Number(event.target.value))
            }
          />
        </label>
      ))}
      {items
        .filter(
          (item) =>
            !options.some((option) => option.size.id === item.meal_size_id),
        )
        .map((item) => (
          <label
            key={item.meal_size_id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span>
              {item.label || 'Previously selected meal'} — no longer available;
              set to 0 to replace
            </span>
            <input
              aria-label="Unavailable meal quantity"
              className="admin-field mt-0 w-20"
              type="number"
              min={0}
              step={1}
              value={item.quantity}
              onChange={(event) =>
                change(
                  item.meal_id,
                  item.meal_size_id,
                  Number(event.target.value),
                )
              }
            />
          </label>
        ))}
      {options.length === 0 && (
        <p>No meals are available for this order type.</p>
      )}
    </div>
  );
}
function OrderEditor({
  order,
  customer,
  meals,
  busy,
  onSubmit,
}: {
  order: AccountOrder;
  customer: Customer;
  meals: Meal[];
  busy: boolean;
  onSubmit: (form: FormData) => void;
}) {
  const initial = (order.order_items || [])
    .filter((item) => item.meal_size_id)
    .map((item) => ({
      meal_id: item.meal_id,
      meal_size_id: item.meal_size_id!,
      quantity: item.quantity,
      label:
        item.meal_name_snapshot ||
        item.meals?.name ||
        'Previously selected meal',
    }));
  const [items, setItems] = useState<Choice[]>(initial);
  const [key] = useState(() => crypto.randomUUID());
  const required = order.included_credits_snapshot ?? initial.reduce((sum, item) => sum + item.quantity, 0);
  const mix = subscriptionMix(items.map((item) => ({ quantity: item.quantity, kind: getSubscriptionKind(meals.find((meal) => meal.id === item.meal_id) ?? { name: '', tags: [] }) })), required);
  return (
    <form
      className="space-y-4 border-t border-brand-plum/10 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set('order_id', order.id);
        data.set('operation', 'edit');
        data.set('request_key', key);
        data.set('items', JSON.stringify(items));
        onSubmit(data);
      }}
    >
      <h4 className="font-bold">Edit meals &amp; delivery address</h4>
      <p className="admin-help">
        Increase quantities to add meals; set a quantity to 0 to remove it.
        Price increases require an additional payment before changes are saved.
        Price reductions are refunded. Subscription orders must keep the same
        total number of meals, with half sides and half entrées.
        Food orders must remain at least $55 before delivery fees and glass-container deposits.
      </p>
      <MealChoices
        meals={meals}
        mode={order.order_type}
        initial={initial}
        onChange={setItems}
      />
      <AddressFields customer={customer} order={order} />
      {order.order_type === 'subscription' && <p className="admin-help">{mix.sides}/{mix.half} sides · {mix.entrees}/{mix.half} entrées</p>}
      <button disabled={busy || (order.order_type === 'subscription' && !mix.valid)} className="admin-primary-button">
        {busy ? 'Saving…' : 'Save order changes'}
      </button>
    </form>
  );
}
function WeeklyEditor({
  sub,
  menu,
  meals,
  initial,
  busy,
  onSubmit,
}: {
  sub: AccountSubscription;
  menu: { id: string; week_start: string };
  meals: Meal[];
  initial: Choice[];
  busy: boolean;
  onSubmit: (form: FormData) => void;
}) {
  const [items, setItems] = useState<Choice[]>(initial);
  const required = sub.included_credits_snapshot || sub.plan_size;
  const mix = subscriptionMix(items.map((item) => ({ quantity: item.quantity, kind: getSubscriptionKind(meals.find((meal) => meal.id === item.meal_id) ?? { name: '', tags: [] }) })), required);
  return (
    <form
      className="space-y-3 border-t border-brand-plum/10 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData();
        data.set('subscription_id', sub.id);
        data.set('menu_id', menu.id);
        data.set('items', JSON.stringify(items));
        onSubmit(data);
      }}
    >
      <h4 className="font-bold">Meals for week of {menu.week_start}</h4>
      <p className="text-sm">
        Choose {required / 2} sides and {required / 2} entrées. Choices close Monday at 8:00 p.m. Eastern.
        Selected: {mix.sides}/{mix.half} sides · {mix.entrees}/{mix.half} entrées.
      </p>
      <MealChoices
        meals={meals}
        mode="subscription"
        initial={initial}
        onChange={setItems}
      />
      <button
        disabled={busy || !mix.valid}
        className="admin-primary-button"
      >
        Save upcoming meals
      </button>
    </form>
  );
}
