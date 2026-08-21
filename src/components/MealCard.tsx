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
      aria-label={`View ${meal.name} details`}
      className="group flex h-full flex-col overflow-hidden rounded-panel border border-brand-plum/10 bg-white text-left shadow-soft transition hover:-translate-y-1 hover:border-brand-plum/20 hover:shadow-lift disabled:opacity-50"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#eee9e2]">
        {meal.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.image_url}
            alt={meal.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
          />
        ) : (
          <MealImageFallback />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" aria-hidden />
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-plum px-3 py-1 text-xs font-semibold text-white">
            Sold out
          </span>
        )}
        {!soldOut && meal.tags.slice(0, 1).map((tag) => (
          <span key={tag} className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-brand-plum shadow-sm">
            {formatTag(tag)}
          </span>
        ))}
        <span className="absolute bottom-3 left-3 text-xs font-medium text-white/90">by {meal.chef_name}</span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-bold leading-snug text-brand-plum">{meal.name}</h3>
        {meal.subtitle && <p className="mt-1.5 text-sm leading-5 text-ink/60">{meal.subtitle}</p>}
        {meal.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/60">{meal.description}</p>}

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-brand-plum/10 pt-4">
          <div>
            <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-ink/50">Per meal</span>
            <span className="mt-0.5 block text-lg font-bold text-brand-plum">{formatCents(meal.price_cents)}</span>
          </div>
          <div className="text-right text-xs leading-5 text-ink/55">
            {meal.calories != null && <span className="block">{meal.calories} cal</span>}
            {meal.protein_g != null && <span className="block">{meal.protein_g}g protein</span>}
          </div>
        </div>
        <span className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-brand-plum/5 px-4 py-2 text-sm font-bold text-brand-plum transition group-hover:bg-brand-plum group-hover:text-white">
          View details &amp; add
        </span>
      </div>
    </button>
  );
}

function formatTag(tag: string) {
  return tag.replace(/[-_]/g, ' ');
}

function MealImageFallback() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f6e9de,transparent_55%)] text-brand-plum/45">
      <svg aria-hidden viewBox="0 0 64 64" className="h-16 w-16 fill-none stroke-current" strokeWidth="1.5">
        <path d="M13 32h38c0 11-8.5 19-19 19s-19-8-19-19Z" /><path d="M9 32h46M22 25c-3-4 3-6 0-10M32 25c-3-4 3-6 0-10M42 25c-3-4 3-6 0-10" strokeLinecap="round" />
      </svg>
      <span className="mt-2 text-xs font-bold uppercase tracking-[0.16em]">Photo coming soon</span>
    </div>
  );
}
