'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import {
  DEPOSIT_PER_CONTAINER_CENTS,
  formatCents,
  isInDeliveryArea,
} from '@/lib/constants';

export default function CheckoutPage() {
  const {
    lines,
    remove,
    totalMeals,
    mode,
    planSize,
    perMealCents,
    subtotalCents,
    depositCents,
    totalCents,
  } = useCart();

  const [zip, setZip] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zipTouched = zip.length >= 5;
  const zipOk = isInDeliveryArea(zip);
  const planIncomplete = mode === 'subscription' && totalMeals !== planSize;
  const canSubmit =
    totalMeals > 0 && zipOk && email.includes('@') && name.trim() !== '' && !planIncomplete;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          planSize,
          zip,
          email,
          name,
          items: lines.map((l) => ({ mealId: l.meal.id, quantity: l.quantity })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Checkout failed');
      if (json.url) window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (totalMeals === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Your order is empty</h1>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white hover:bg-moss-700"
        >
          Browse this week&apos;s menu
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="font-display text-3xl font-bold">Review your order</h1>

        <div className="mt-6 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/5">
          {lines.map((l) => (
            <div key={l.meal.id} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
                {l.meal.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.meal.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">🍲</div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{l.meal.name}</div>
                <div className="text-sm text-black/50">
                  {l.quantity} × {formatCents(perMealCents)}
                </div>
              </div>
              <button
                onClick={() => remove(l.meal.id)}
                className="text-sm text-black/40 hover:text-black"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <h2 className="mt-10 font-display text-xl font-bold">Delivery details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <div>
            <label className="text-sm font-medium">ZIP code</label>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              inputMode="numeric"
              maxLength={5}
              className="mt-1 w-full rounded-xl px-4 py-3 ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
            />
            {zipTouched && !zipOk && (
              <p className="mt-2 text-sm text-clay-500">
                We only deliver within North Carolina right now. Leave your email and we&apos;ll
                tell you when we reach you.
              </p>
            )}
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5 lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-bold">
          {mode === 'subscription' ? `Weekly plan · ${planSize} meals` : 'One-time box'}
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <Row label={`${totalMeals} meals`} value={formatCents(subtotalCents)} />
          <Row
            label={`Container deposit (${totalMeals} × ${formatCents(
              DEPOSIT_PER_CONTAINER_CENTS
            )})`}
            value={formatCents(depositCents)}
          />
          <Row label="Delivery" value="Free" />
          <div className="border-t border-black/10 pt-3">
            <Row label="Total today" value={formatCents(totalCents)} bold />
          </div>
        </dl>

        <div className="mt-4 rounded-xl bg-moss-50 p-4 text-xs leading-relaxed text-moss-700">
          <strong>About the deposit.</strong> {formatCents(DEPOSIT_PER_CONTAINER_CENTS)} per
          glass container, fully refundable. Rinse them, leave them out on your next delivery
          day, and the deposit comes back as a refund or credit toward your next order.
          {mode === 'subscription' &&
            ' As a subscriber you only pay this once — after that you simply swap empties for fulls.'}
        </div>

        {planIncomplete && (
          <p className="mt-4 text-sm text-clay-500">
            Your {planSize}-meal plan needs {planSize - totalMeals} more meal
            {planSize - totalMeals === 1 ? '' : 's'}.{' '}
            <Link href="/menu" className="underline">
              Add more
            </Link>
          </p>
        )}

        {error && <p className="mt-4 text-sm text-clay-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="mt-6 w-full rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-black/20"
        >
          {submitting ? 'Redirecting…' : 'Continue to payment'}
        </button>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl px-4 py-3 ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <dt className="text-black/60">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
