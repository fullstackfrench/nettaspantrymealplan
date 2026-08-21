'use client';

import { useMemo, useState } from 'react';
import FilterBar from './FilterBar';
import MealCard from './MealCard';
import MealModal from './MealModal';
import PlanPicker from './PlanPicker';
import { useCart } from '@/lib/cart';
import type { Meal, PublicSubscriptionPlan } from '@/lib/types';

export default function MenuBrowser({ meals, plans }: { meals: Meal[]; plans: PublicSubscriptionPlan[] }) {
  const [active, setActive] = useState('all');
  const [selected, setSelected] = useState<Meal | null>(null);
  const { totalMeals, remaining, mode } = useCart();

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of meals) for (const t of m.tags) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [meals]);

  const filtered = useMemo(
    () => (active === 'all' ? meals : meals.filter((m) => m.tags.includes(active))),
    [meals, active]
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <PlanPicker plans={plans} />

      <div className="mt-8">
        <FilterBar active={active} onChange={setActive} counts={counts} />
      </div>

      {mode === 'subscription' && (
        <p className="mt-4 text-sm text-black/60">
          {remaining > 0
            ? `Pick ${remaining} more meal${remaining === 1 ? '' : 's'} to fill your plan.`
            : 'Your plan is full — head to checkout when you are ready.'}
        </p>
      )}
      {mode === 'one_time' && totalMeals > 0 && (
        <p className="mt-4 text-sm text-black/60">
          {totalMeals} meal{totalMeals === 1 ? '' : 's'} in your box.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-black/50">
          No meals match that filter this week.
        </p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((meal) => (
            <MealCard key={meal.id} meal={meal} onSelect={setSelected} mode={mode} />
          ))}
        </div>
      )}

      <MealModal meal={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
