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
      aria-label={available ? `View ${meal.name} details` : `${meal.name} is unavailable for this order type`}
      className="group flex h-full flex-col overflow-hidden rounded-panel border border-brand-plum/10 bg-white text-left shadow-soft transition hover:-translate-y-1 hover:border-brand-plum/20 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-plum disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#eee9e2]">
        {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl">🍲</div>}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" aria-hidden />
        {!available ? <span className="absolute left-3 top-3 rounded-full bg-brand-plum px-3 py-1 text-xs font-semibold text-white">Unavailable</span> : meal.tags.slice(0, 1).map((tag) => <span key={tag} className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-brand-plum shadow-sm">{tag.replace(/[-_]/g, ' ')}</span>)}
        <span className="absolute bottom-3 left-3 text-xs font-medium text-white/90">by {meal.chef_name}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-bold leading-snug text-brand-plum">{meal.name}</h3>
        {meal.subtitle && <p className="mt-1.5 text-sm leading-5 text-ink/60">{meal.subtitle}</p>}
        {meal.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/60">{meal.description}</p>}
        <div className="mt-auto border-t border-brand-plum/10 pt-4 text-sm font-bold text-brand-plum">{purchaseDetail}</div>
        <span className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-brand-plum/5 px-4 py-2 text-sm font-bold text-brand-plum transition group-hover:bg-brand-plum group-hover:text-white">View details &amp; add</span>
      </div>
    </button>
  );
}
