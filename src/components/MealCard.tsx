'use client';

import { formatCents } from '@/lib/constants';
import type { OrderMode } from '@/lib/cart';
import type { Meal } from '@/lib/types';

interface Props {
  meal: Meal;
  mode: OrderMode;
  onSelect: (meal: Meal) => void;
}

export default function MealCard({ meal, mode, onSelect }: Props) {
  const sizes = meal.meal_sizes ?? [];
  const oneTimeSizes = sizes.filter((size) => size.is_active && size.is_available_for_one_time && size.servings != null);
  const subscriptionSizes = sizes.filter((size) => size.is_active && size.is_available_for_subscription && size.servings != null);
  const available = mode === 'one_time'
    ? meal.is_available_for_one_time && oneTimeSizes.length > 0
    : meal.is_available_for_subscription && subscriptionSizes.length === 1;

  let purchaseDetail = 'Unavailable for this order type';
  if (mode === 'one_time' && available) {
    if (oneTimeSizes.length === 1) {
      const size = oneTimeSizes[0];
      purchaseDetail = `${size.label} · Feeds ${size.servings} · ${formatCents(size.price_cents)}`;
    } else {
      purchaseDetail = `From ${formatCents(Math.min(...oneTimeSizes.map((size) => size.price_cents)))}`;
    }
  } else if (mode === 'subscription' && available) {
    const size = subscriptionSizes[0];
    purchaseDetail = `${size.label} · Feeds ${size.servings}`;
  }

  return (
    <button
      onClick={() => onSelect(meal)}
      disabled={!available}
      className="group flex flex-col rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-lg hover:ring-black/15 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="h-7 w-7 overflow-hidden rounded-full bg-clay-100">
          {meal.chef_avatar_url && <img src={meal.chef_avatar_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <span className="text-sm font-semibold">{meal.chef_name}</span>
      </div>
      <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-cream">
        {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl">🍲</div>}
        {!available && <span className="absolute left-3 top-3 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">Unavailable</span>}
      </div>
      <h3 className="font-display text-lg font-bold leading-snug">{meal.name}</h3>
      {meal.subtitle && <p className="mt-1 text-sm text-black/50">{meal.subtitle}</p>}
      <div className="mt-3 text-xs font-semibold text-black/70">{purchaseDetail}</div>
    </button>
  );
}
