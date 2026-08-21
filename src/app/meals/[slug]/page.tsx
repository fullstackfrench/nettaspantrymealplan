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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/menu" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 py-2 text-sm font-bold text-brand-plum ring-1 ring-brand-plum/15 transition hover:bg-brand-plum/5">← Back to menu</Link>
      <div className="mt-7 grid gap-8 md:grid-cols-2 lg:gap-12">
        <div className="aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-white shadow-soft md:aspect-[4/5]">
          {meal.image_url ? <img src={meal.image_url} alt={meal.name} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f6e9de,transparent_60%)] text-brand-plum/45"><span className="font-brand text-4xl">Made with care</span><span className="mt-3 text-xs font-bold uppercase tracking-wider">Photo coming soon</span></div>}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">From this week&apos;s kitchen</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-brand-plum md:text-4xl">{meal.name}</h1>
          {meal.subtitle && <p className="mt-2 text-lg leading-7 text-ink/60">{meal.subtitle}</p>}
          <p className="mt-4 text-sm font-bold text-brand-plum">Prepared by {meal.chef_name}</p>
          {meal.allergen_free.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{meal.allergen_free.map((item) => <span key={item} className="rounded-full bg-moss-50 px-3 py-2 text-xs font-bold text-moss-700 ring-1 ring-moss-600/15">{item}</span>)}</div>}
          {meal.description && <p className="mt-6 leading-8 text-ink/70">{meal.description}</p>}
          {meal.ingredients.length > 0 && <div className="mt-8"><h2 className="font-display text-xl font-bold text-brand-plum">Ingredients</h2><p className="mt-2 leading-7 text-ink/65">{meal.ingredients.join(', ')}.</p></div>}
          <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-brand-plum/10 text-center text-sm min-[420px]:grid-cols-4"><Stat label="calories" value={meal.calories} /><Stat label="protein" value={meal.protein_g} suffix="g" /><Stat label="carbs" value={meal.carbs_g} suffix="g" /><Stat label="fat" value={meal.fat_g} suffix="g" /></div>

          {meal.is_available_for_one_time && oneTimeSizes.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-xl font-bold text-brand-plum">One-time sizes</h2>
              <div className="mt-3 space-y-2">
                {oneTimeSizes.map((size) => <div key={size.id} className="flex justify-between rounded-control border border-brand-plum/10 bg-white p-4 shadow-soft"><span>{size.label} · Feeds {size.servings}</span><strong className="text-brand-plum">{formatCents(size.price_cents)}</strong></div>)}
              </div>
            </div>
          )}
          {meal.is_available_for_subscription && subscriptionSize && (
            <div className="mt-6 rounded-control bg-moss-50 p-4 text-sm text-moss-700">Subscription size: <strong>{subscriptionSize.label} · Feeds {subscriptionSize.servings}</strong></div>
          )}
          <Link href="/menu" className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-brand-plum px-6 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-[#542043]">Choose from the menu</Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return <div className="bg-white px-2 py-4"><div className="font-bold text-brand-plum">{value != null ? `${value}${suffix}` : '—'}</div><div className="text-xs text-ink/55">{label}</div></div>;
}
