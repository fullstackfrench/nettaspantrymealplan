'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';
import type { Meal } from '@/lib/types';

interface Props {
  meal: Meal | null;
  onClose: () => void;
}

export default function MealModal({ meal, onClose }: Props) {
  // Hooks must run on every render, so useCart comes before any early return.
  const { add, mode, remaining } = useCart();

  // Close on Escape and lock background scroll while open.
  useEffect(() => {
    if (!meal) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [meal, onClose]);

  if (!meal) return null;

  const planFull = mode === 'subscription' && remaining === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={meal.name}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-8 md:p-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-6 text-2xl leading-none text-black/40 hover:text-black"
        >
          ×
        </button>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="aspect-square overflow-hidden rounded-2xl bg-cream">
            {meal.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-6xl">🍲</div>
            )}
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold leading-tight md:text-3xl">
              {meal.name}
            </h2>
            {meal.subtitle && <p className="mt-1 text-black/50">{meal.subtitle}</p>}

            <p className="mt-4 text-sm font-semibold">{meal.chef_name}</p>

            {meal.description && (
              <p className="mt-4 text-sm leading-relaxed text-black/70">{meal.description}</p>
            )}

            {(meal.calories || meal.protein_g) && (
              <div className="mt-5 grid grid-cols-4 gap-2 rounded-xl bg-cream p-3 text-center text-xs">
                <Stat label="cal" value={meal.calories} />
                <Stat label="protein" value={meal.protein_g} suffix="g" />
                <Stat label="carbs" value={meal.carbs_g} suffix="g" />
                <Stat label="fat" value={meal.fat_g} suffix="g" />
              </div>
            )}

            {meal.ingredients.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-bold">Ingredients</h3>
                <p className="mt-1 text-sm leading-relaxed text-black/60">
                  {meal.ingredients.join(', ')}.
                </p>
              </div>
            )}

            {meal.allergen_free.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {meal.allergen_free.map((a) => (
                  <span
                    key={a}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-black/15"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  add(meal);
                  onClose();
                }}
                disabled={planFull}
                className="rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white hover:bg-moss-700 disabled:cursor-not-allowed disabled:bg-black/20"
              >
                {planFull
                  ? 'Plan is full'
                  : `Add to order · ${formatCents(meal.price_cents)}`}
              </button>

              <Link
                href={`/meals/${meal.slug}`}
                className="rounded-full px-6 py-3 text-sm font-semibold ring-1 ring-black/20 hover:bg-black/5"
              >
                View more meal details
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div>
      <div className="font-bold">{value != null ? `${value}${suffix}` : '—'}</div>
      <div className="text-black/45">{label}</div>
    </div>
  );
}
