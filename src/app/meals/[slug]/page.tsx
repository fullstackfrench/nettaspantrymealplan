import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicMealBySlug } from '@/lib/catalog';
import { formatCents } from '@/lib/constants';

export const revalidate = 60;

export default async function MealDetailPage({ params }: { params: { slug: string } }) {
  const meal = await getPublicMealBySlug(params.slug);
  if (!meal) notFound();
  const oneTimeSizes = (meal.meal_sizes ?? []).filter((size) => size.is_available_for_one_time);
  const subscriptionSize = (meal.meal_sizes ?? []).find((size) => size.is_available_for_subscription);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/menu" className="inline-block rounded-full bg-black/5 px-5 py-2 text-sm font-semibold">← Back to menu</Link>
      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-3xl bg-white">
          {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-7xl">🍲</div>}
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">{meal.name}</h1>
          {meal.subtitle && <p className="mt-2 text-lg text-black/50">{meal.subtitle}</p>}
          {meal.description && <p className="mt-6 leading-relaxed text-black/70">{meal.description}</p>}
          {meal.ingredients.length > 0 && <div className="mt-8"><h2 className="font-display text-lg font-bold">Ingredients</h2><p className="mt-2 text-black/60">{meal.ingredients.join(', ')}.</p></div>}

          {meal.is_available_for_one_time && oneTimeSizes.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-lg font-bold">One-time sizes</h2>
              <div className="mt-3 space-y-2">
                {oneTimeSizes.map((size) => <div key={size.id} className="flex justify-between rounded-xl bg-white p-4"><span>{size.label} · Feeds {size.servings}</span><strong>{formatCents(size.price_cents)}</strong></div>)}
              </div>
            </div>
          )}
          {meal.is_available_for_subscription && subscriptionSize && (
            <div className="mt-6 rounded-xl bg-moss-50 p-4 text-sm">Subscription size: <strong>{subscriptionSize.label} · Feeds {subscriptionSize.servings}</strong></div>
          )}
          <Link href="/menu" className="mt-8 inline-block rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white">Choose from the menu</Link>
        </div>
      </div>
    </div>
  );
}
