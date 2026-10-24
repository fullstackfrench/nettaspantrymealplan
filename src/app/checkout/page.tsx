'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ORDER_CHANGE_POLICY } from '@/lib/account/policy';
import { useCart } from '@/lib/cart';
import { isInDeliveryArea, formatCents } from '@/lib/constants';
import { meetsOrderMinimum, MINIMUM_ORDER_CENTS, MINIMUM_ORDER_MESSAGE } from '@/lib/minimum-order';

export default function CheckoutPage() {
  const {
    lines,
    remove,
    totalMeals,
    mode,
    selectedPlan,
    subscriptionSides,
    subscriptionEntrees,
    subscriptionComplete,
    subtotalCents,
    glassFeeCents,
    deliveryFeeCents,
    orderingOpen,
    setChargeDeposit,
    totalCents,
  } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [zip, setZip] = useState('');
  const [street, setStreet] = useState('');
  const [unit, setUnit] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const client = createClient();
    client.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setSignedIn(true);
      setEmail(user.email || '');
      const { data } = await client
        .from('customers')
        .select('full_name,address_line1,address_line2,city,zip,delivery_notes,glass_fee_paid_at')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (data) {
        setName(data.full_name || '');
        setStreet(data.address_line1 || '');
        setUnit(data.address_line2 || '');
        setCity(data.city || '');
        setZip(data.zip || '');
        setNotes(data.delivery_notes || '');
        setChargeDeposit(!data.glass_fee_paid_at);
      }
    });
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<null | {
    orderId: string;
    subtotalCents: number;
    depositCents: number;
    glassFeeCents: number;
    deliveryFeeCents: number;
    totalCents: number;
    paymentStatus: string;
  }>(null);
  const preparationKey = useRef<string | null>(null);

  if (totalMeals === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Your order is empty</h1>
        <Link
          href="/menu"
          className="mt-6 inline-block rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white"
        >
          Browse this week&apos;s menu
        </Link>
      </div>
    );
  }

  const incomplete =
    mode === 'subscription' && (!selectedPlan || !subscriptionComplete);
  const belowMinimum = !meetsOrderMinimum(subtotalCents);
  const contactComplete =
    street.trim() !== '' &&
    city.trim() !== '' &&
    name.trim() !== '' &&
    email.includes('@') &&
    isInDeliveryArea(zip);

  async function prepareOrder() {
    if (submitting || prepared || incomplete || belowMinimum || !orderingOpen || !contactComplete) return;
    setSubmitting(true);
    setError(null);
    preparationKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkoutPreparationId: preparationKey.current,
          mode,
          ...(mode === 'subscription'
            ? { subscriptionPlanId: selectedPlan?.id }
            : {}),
          customer: {
            name,
            email,
            zip,
            address_line1: street,
            address_line2: unit,
            city,
            delivery_notes: notes,
          },
          items: lines.map((line) => ({
            mealId: line.mealId,
            mealSizeId: line.mealSizeId,
            quantity: line.quantity,
          })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status < 500) preparationKey.current = null;
        throw new Error(result.error ?? 'Unable to prepare this order.');
      }
      setPrepared(result);
      if (result.url) window.location.assign(result.url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to prepare this order.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="font-display text-3xl font-bold">Review your order</h1>
        <p className="mt-2 text-sm text-black/50">
          Pay securely after confirming your meals and delivery details.
        </p>
        <div className="mt-6 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/5">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream">
                {line.display.imageUrl ? (
                  <img
                    src={line.display.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    🍲
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold">{line.display.mealName}</div>
                <div className="text-sm text-black/50">
                  {line.display.sizeLabel} · Feeds {line.display.servings}
                </div>
                <div className="text-sm text-black/50">
                  {line.quantity} selected
                  {line.kind === 'one_time' &&
                    ` × ${formatCents(line.display.unitPriceCents)}`}
                </div>
              </div>
              <button
                onClick={() => remove(line.id)}
                disabled={Boolean(prepared)}
                className="text-sm text-black/40 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remove one
              </button>
            </div>
          ))}
        </div>
        <p className="mt-6 rounded-control bg-cream p-4 text-sm">
          {ORDER_CHANGE_POLICY}
        </p>
        {!signedIn && (
          <p className="mt-4 text-sm">
            You can check out as a guest, or{' '}
            <Link href="/login?redirect=/checkout" className="underline">
              sign in or create an account
            </Link>{' '}
            to manage this order.
          </p>
        )}
        <h2 className="mt-10 font-display text-xl font-bold">
          Checkout contact
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            value={name}
            onChange={setName}
            disabled={Boolean(prepared)}
          />
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            disabled={Boolean(prepared)}
          />
          <Field
            label="Street address"
            value={street}
            onChange={setStreet}
            disabled={Boolean(prepared)}
          />
          <Field
            label="Apartment / unit"
            value={unit}
            onChange={setUnit}
            disabled={Boolean(prepared)}
          />
          <Field
            label="City"
            value={city}
            onChange={setCity}
            disabled={Boolean(prepared)}
          />
          <Field
            label="Delivery instructions"
            value={notes}
            onChange={setNotes}
            disabled={Boolean(prepared)}
          />
          <Field
            label="Delivery ZIP"
            inputMode="numeric"
            maxLength={5}
            value={zip}
            onChange={setZip}
            disabled={Boolean(prepared)}
          />
        </div>
      </div>

      <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5 lg:sticky lg:top-24">
        <h2 className="font-display text-lg font-bold">
          {mode === 'subscription'
            ? (selectedPlan?.name ?? 'Weekly subscription')
            : 'One-time box'}
        </h2>
        {mode === 'subscription' && selectedPlan && (
          <p className="mt-1 text-xs text-black/50">
            {formatCents(selectedPlan.priceCents)}/
            {selectedPlan.billingInterval} · {selectedPlan.includedCredits}{' '}
            meals
          </p>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          <Row
            label={
              mode === 'subscription'
                ? 'Plan total'
                : `${totalMeals} meal units`
            }
            value={formatCents(subtotalCents)}
          />
          <Row
            label="One-time, non-refundable glass-container deposit"
            value={formatCents(glassFeeCents)}
          />
          <Row label="Delivery" value={formatCents(deliveryFeeCents)} />
          <div className="border-t border-black/10 pt-3">
            <Row label="Preview total" value={formatCents(totalCents)} bold />
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink/65">Delivery is available throughout North Carolina. Returning customers should sign in so their paid glass deposit is recognized.</p>
        {!orderingOpen && <p role="status" className="mt-4 text-sm text-brand-brick">New weekly orders close Monday at 8:00 p.m. Eastern. Ordering resumes with the next published menu.</p>}
        {belowMinimum && (
          <p role="status" className="mt-4 rounded-xl bg-clay-100 p-3 text-sm text-clay-500">
            {MINIMUM_ORDER_MESSAGE} Add {formatCents(Math.max(0, MINIMUM_ORDER_CENTS - subtotalCents))} more food to continue.
          </p>
        )}
        {incomplete && (
          <p className="mt-4 text-sm text-clay-500">
            Choose exactly {selectedPlan ? selectedPlan.includedCredits / 2 : 'half'} sides and {selectedPlan ? selectedPlan.includedCredits / 2 : 'half'} entrées.
            Selected: {subscriptionSides} sides and {subscriptionEntrees} entrées.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-clay-100 p-3 text-sm text-clay-500">
            {error}
          </p>
        )}
        {prepared ? (
          <div className="mt-6 rounded-xl bg-moss-50 p-4 text-sm text-moss-700">
            <strong>Your order is ready for payment.</strong>
            <p className="mt-1">Opening secure payment checkout…</p>
            <p className="mt-2 text-xs">
              Preparation reference: {prepared.orderId}
            </p>
            <p className="mt-2 font-semibold">
              Authoritative total: {formatCents(prepared.totalCents)}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={prepareOrder}
            disabled={submitting || incomplete || belowMinimum || !orderingOpen || !contactComplete}
            className="mt-6 min-h-12 w-full rounded-full bg-brand-plum px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Preparing payment…' : 'Continue to secure payment'}
          </button>
        )}
        <Link
          href="/menu"
          className="mt-4 block text-center text-sm font-semibold underline"
        >
          Return to menu
        </Link>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'inputMode' | 'maxLength'
>) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        {...inputProps}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl px-4 py-3 ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-brand-plum disabled:bg-black/5"
      />
    </label>
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
