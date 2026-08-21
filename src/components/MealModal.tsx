'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';
import type { Meal } from '@/lib/types';

export default function MealModal({ meal, onClose }: { meal: Meal | null; onClose: () => void }) {
  const { addOneTime, addSubscription, mode, remaining, selectedPlan } = useCart();
  const oneTimeSizes = useMemo(() => (meal?.meal_sizes ?? []).filter((size) => size.is_active && size.is_available_for_one_time && size.servings != null), [meal]);
  const subscriptionSizes = useMemo(() => (meal?.meal_sizes ?? []).filter((size) => size.is_active && size.is_available_for_subscription && size.servings != null), [meal]);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setSelectedSizeId(mode === 'one_time' && oneTimeSizes.length === 1 ? oneTimeSizes[0].id : null);
  }, [meal, mode, oneTimeSizes]);

  useEffect(() => {
    if (!meal) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus();
    };
  }, [meal, onClose]);

  if (!meal) return null;
  const selectedSize = oneTimeSizes.find((size) => size.id === selectedSizeId) ?? null;
  const subscriptionSize = subscriptionSizes.length === 1 ? subscriptionSizes[0] : null;
  const planFull = mode === 'subscription' && (!selectedPlan || remaining === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-plum/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={meal.description ? descriptionId : undefined} className="relative max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-[1.5rem] bg-white p-4 shadow-lift sm:max-h-[90vh] sm:rounded-[1.75rem] sm:p-7 lg:p-9" onClick={(event) => event.stopPropagation()}>
        <button ref={closeButtonRef} onClick={onClose} aria-label="Close meal details" className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-plum shadow-soft ring-1 ring-brand-plum/10 transition hover:bg-brand-plum hover:text-white sm:right-5 sm:top-5"><svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button>
        <div className="grid gap-6 md:grid-cols-[.95fr_1.05fr] md:gap-8">
          <div className="aspect-[4/3] overflow-hidden rounded-panel bg-cream md:sticky md:top-0 md:aspect-[4/5]">
            {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f6e9de,transparent_60%)] text-brand-plum/45"><span className="font-brand text-3xl">Made with care</span><span className="mt-2 text-xs font-bold uppercase tracking-wider">Photo coming soon</span></div>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">From this week&apos;s kitchen</p>
            <h2 id={titleId} className="mt-2 pr-10 font-display text-2xl font-bold leading-tight text-brand-plum md:text-3xl">{meal.name}</h2>
            {meal.subtitle && <p className="mt-2 leading-6 text-ink/60">{meal.subtitle}</p>}
            <p className="mt-4 text-sm font-bold text-brand-plum">Prepared by {meal.chef_name}</p>
            {meal.description && <p id={descriptionId} className="mt-4 text-sm leading-7 text-ink/70">{meal.description}</p>}
            {(meal.calories || meal.protein_g) && <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-control bg-brand-plum/10 text-center text-xs min-[420px]:grid-cols-4"><Stat label="cal" value={meal.calories} /><Stat label="protein" value={meal.protein_g} suffix="g" /><Stat label="carbs" value={meal.carbs_g} suffix="g" /><Stat label="fat" value={meal.fat_g} suffix="g" /></div>}
            {meal.allergen_free.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{meal.allergen_free.map((item) => <span key={item} className="rounded-full bg-moss-50 px-3 py-1.5 text-xs font-bold text-moss-700 ring-1 ring-moss-600/15">{item}</span>)}</div>}

            {mode === 'one_time' ? (
              <fieldset className="mt-6">
                <legend className="text-sm font-bold text-brand-plum">Choose a size</legend>
                <div className="mt-2 space-y-2">
                  {oneTimeSizes.map((size) => (
                    <label key={size.id} className={`flex min-h-12 cursor-pointer items-center justify-between rounded-control p-3 ring-1 transition ${selectedSizeId === size.id ? 'bg-brand-plum/5 ring-2 ring-brand-plum' : 'ring-brand-plum/15 hover:ring-brand-plum/35'}`}>
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
              <div className="mt-6 rounded-control bg-moss-50 p-4 text-sm text-moss-700">
                Subscription size: <strong>{subscriptionSize.label} · Feeds {subscriptionSize.servings}</strong>
              </div>
            ) : (
              <p className="mt-6 text-sm text-clay-500">This meal is not currently available for subscriptions.</p>
            )}

            <div className="mt-7 grid gap-3 sm:grid-cols-[auto_1fr]">
              <button
                onClick={() => {
                  if (mode === 'one_time' && selectedSize) addOneTime(meal, selectedSize);
                  if (mode === 'subscription' && subscriptionSize) addSubscription(meal, subscriptionSize);
                  onClose();
                }}
                disabled={mode === 'one_time' ? !selectedSize : planFull || !subscriptionSize}
                className="min-h-12 rounded-full bg-brand-plum px-6 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-[#542043] disabled:cursor-not-allowed disabled:bg-black/20"
              >
                {mode === 'one_time'
                  ? selectedSize ? `Add to order · ${formatCents(selectedSize.price_cents)}` : 'Choose a size'
                  : planFull ? selectedPlan ? 'Plan is full' : 'Choose a plan' : 'Add to plan'}
              </button>
              <Link href={`/meals/${meal.slug}`} className="inline-flex min-h-12 items-center justify-center rounded-full px-5 py-3 text-center text-sm font-bold text-brand-plum ring-1 ring-brand-plum/20 transition hover:bg-brand-plum/5">View meal details</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return <div className="bg-cream px-2 py-3"><div className="font-bold text-brand-plum">{value != null ? `${value}${suffix}` : '—'}</div><div className="mt-0.5 text-ink/55">{label}</div></div>;
}
