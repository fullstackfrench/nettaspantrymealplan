import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/constants';
import type { Meal } from '@/lib/types';

export const revalidate = 60;

export default async function MealDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('meals')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (!data) notFound();
  const meal = data as Meal;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link
        href="/menu"
        className="inline-block rounded-full bg-black/5 px-5 py-2 text-sm font-semibold hover:bg-black/10"
      >
        ← Back to menu
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-3xl bg-white">
          {meal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-7xl">🍲</div>
          )}
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold leading-tight md:text-4xl">
            {meal.name}
          </h1>
          {meal.subtitle && <p className="mt-2 text-lg text-black/50">{meal.subtitle}</p>}
          <p className="mt-4 font-semibold">by {meal.chef_name}</p>

          {meal.allergen_free.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {meal.allergen_free.map((a) => (
                <span
                  key={a}
                  className="rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-black/15"
                >
                  {a}
                </span>
              ))}
            </div>
          )}

          {meal.description && (
            <p className="mt-6 leading-relaxed text-black/70">{meal.description}</p>
          )}

          {meal.ingredients.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold">Ingredients</h2>
              <p className="mt-2 leading-relaxed text-black/60">
                {meal.ingredients.join(', ')}.
              </p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-4 gap-3 rounded-2xl bg-white p-4 text-center text-sm">
            <Stat label="calories" value={meal.calories} />
            <Stat label="protein" value={meal.protein_g} suffix="g" />
            <Stat label="carbs" value={meal.carbs_g} suffix="g" />
            <Stat label="fat" value={meal.fat_g} suffix="g" />
          </div>

          <div className="mt-8 flex items-center gap-4">
            <span className="font-display text-2xl font-bold">
              {formatCents(meal.price_cents)}
            </span>
            <Link
              href="/menu"
              className="rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white hover:bg-moss-700"
            >
              Add from the menu
            </Link>
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
      <div className="text-xs text-black/45">{label}</div>
    </div>
  );
}
