'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';
import type { Meal } from '@/lib/types';

export default function MealModal({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const { addOneTime, addSubscription, mode, remaining, selectedPlan } = useCart();
  const oneTimeSizes = useMemo(() => (meal?.meal_sizes ?? []).filter((size) => size.is_active && size.is_available_for_one_time && size.servings != null), [meal]);
  const subscriptionSizes = useMemo(() => (meal?.meal_sizes ?? []).filter((size) => size.is_active && size.is_available_for_subscription && size.servings != null), [meal]);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSizeId(mode === 'one_time' && oneTimeSizes.length === 1 ? oneTimeSizes[0].id : null);
  }, [meal, mode, oneTimeSizes]);

  useEffect(() => {
    if (!meal) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [meal, onClose]);

  if (!meal) return null;
  const selectedSize = oneTimeSizes.find((size) => size.id === selectedSizeId) ?? null;
  const subscriptionSize = subscriptionSizes.length === 1 ? subscriptionSizes[0] : null;
  const planFull = mode === 'subscription' && (!selectedPlan || remaining === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={meal.name}>
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-8 md:p-10" onClick={(event) => event.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-6 top-6 text-2xl text-black/40 hover:text-black">×</button>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-2xl bg-cream">
            {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-6xl">🍲</div>}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">{meal.name}</h2>
            {meal.subtitle && <p className="mt-1 text-black/50">{meal.subtitle}</p>}
            {meal.description && <p className="mt-4 text-sm leading-relaxed text-black/70">{meal.description}</p>}

            {mode === 'one_time' ? (
              <fieldset className="mt-6">
                <legend className="text-sm font-bold">Choose a size</legend>
                <div className="mt-2 space-y-2">
                  {oneTimeSizes.map((size) => (
                    <label key={size.id} className="flex cursor-pointer items-center justify-between rounded-xl p-3 ring-1 ring-black/15">
                      <span className="flex items-center gap-2">
                        <input type="radio" name="meal_size" checked={selectedSizeId === size.id} onChange={() => setSelectedSizeId(size.id)} />
                        <span>{size.label} · Feeds {size.servings}</span>
                      </span>
                      <strong>{formatCents(size.price_cents)}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : subscriptionSize ? (
              <div className="mt-6 rounded-xl bg-moss-50 p-4 text-sm">
                Subscription size: <strong>{subscriptionSize.label} · Feeds {subscriptionSize.servings}</strong>
              </div>
            ) : (
              <p className="mt-6 text-sm text-clay-500">This meal is not currently available for subscriptions.</p>
            )}

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                onClick={() => {
                  if (mode === 'one_time' && selectedSize) addOneTime(meal, selectedSize);
                  if (mode === 'subscription' && subscriptionSize) addSubscription(meal, subscriptionSize);
                  onClose();
                }}
                disabled={mode === 'one_time' ? !selectedSize : planFull || !subscriptionSize}
                className="rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
              >
                {mode === 'one_time'
                  ? selectedSize ? `Add to order · ${formatCents(selectedSize.price_cents)}` : 'Choose a size'
                  : planFull ? selectedPlan ? 'Plan is full' : 'Choose a plan' : 'Add to plan'}
              </button>
              <Link href={`/meals/${meal.slug}`} className="rounded-full px-6 py-3 text-sm font-semibold ring-1 ring-black/20">View meal details</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
