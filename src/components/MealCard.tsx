'use client';

import { formatCents } from '@/lib/constants';
import type { Meal } from '@/lib/types';

interface Props {
  meal: Meal;
  soldOut?: boolean;
  onSelect: (meal: Meal) => void;
}

export default function MealCard({ meal, soldOut, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(meal)}
      disabled={soldOut}
      className="group flex flex-col rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-lg hover:ring-black/15 disabled:opacity-50"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="h-7 w-7 overflow-hidden rounded-full bg-clay-100">
          {meal.chef_avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meal.chef_avatar_url} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <span className="text-sm font-semibold">{meal.chef_name}</span>
      </div>

      <div className="relative mb-4 aspect-square overflow-hidden rounded-xl bg-cream">
        {meal.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.image_url}
            alt={meal.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">🍲</div>
        )}
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">
            Sold out
          </span>
        )}
      </div>

      <h3 className="font-display text-lg font-bold leading-snug">{meal.name}</h3>
      {meal.subtitle && (
        <p className="mt-1 text-sm text-black/50">{meal.subtitle}</p>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-black/50">
        <span className="font-semibold text-black/70">{formatCents(meal.price_cents)}</span>
        {meal.calories && <span>{meal.calories} cal</span>}
        {meal.protein_g && <span>{meal.protein_g}g protein</span>}
      </div>
    </button>
  );
}
