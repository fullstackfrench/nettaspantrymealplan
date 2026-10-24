'use client';

import { useMemo, useState } from 'react';
import FilterBar from './FilterBar';
import MealCard from './MealCard';
import MealModal from './MealModal';
import PlanPicker from './PlanPicker';
import { useCart } from '@/lib/cart';
import { getAvailableMealSizes } from '@/lib/meal-availability';
import type { Meal, PublicSubscriptionPlan } from '@/lib/types';

export default function MenuBrowser({ meals, plans }: { meals: Meal[]; plans: PublicSubscriptionPlan[] }) {
  const [active, setActive] = useState('all');
  const [selected, setSelected] = useState<Meal | null>(null);
  const { totalMeals, remaining, mode, subscriptionSides, subscriptionEntrees, selectedPlan, orderingOpen, orderingDeadline } = useCart();
  const availableMeals = useMemo(
    () => meals.filter((meal) => getAvailableMealSizes(meal, mode).length > 0),
    [meals, mode]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of availableMeals) for (const t of m.tags) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [availableMeals]);

  const filtered = useMemo(
    () => (active === 'all' ? availableMeals : availableMeals.filter((m) => m.tags.includes(active))),
    [availableMeals, active]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <PlanPicker plans={plans} />
      <p role="status" className="mt-5 rounded-control bg-cream p-4 text-sm font-semibold text-brand-plum">
        {orderingOpen ? 'Order by Monday at 8:00 p.m. Eastern for this menu.' : 'New orders are closed for this menu. Ordering resumes when the next menu is published.'}
        {orderingDeadline && ` Deadline: ${new Date(orderingDeadline).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} Eastern.`}
      </p>

      <div className="mt-7 border-t border-brand-plum/10 pt-7">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Choose what sounds good</p><h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Meals from this week&apos;s kitchen</h2></div>
          <span className="hidden text-sm text-ink/55 sm:block">{filtered.length} dish{filtered.length === 1 ? '' : 'es'}</span>
        </div>
        <FilterBar active={active} onChange={setActive} counts={counts} />
      </div>

      {mode === 'subscription' && (
        <p className="mt-4 rounded-control bg-brand-plum/5 px-4 py-3 text-sm font-medium text-brand-plum" aria-live="polite">
          {selectedPlan ? `${subscriptionSides}/${selectedPlan.includedCredits / 2} sides · ${subscriptionEntrees}/${selectedPlan.includedCredits / 2} entrées selected.` : 'Choose a subscription plan.'}
          {remaining === 0 && selectedPlan && ' Your plan is full — head to checkout when you are ready.'}
        </p>
      )}
      {mode === 'one_time' && totalMeals > 0 && (
        <p className="mt-4 rounded-control bg-brand-plum/5 px-4 py-3 text-sm font-medium text-brand-plum" aria-live="polite">
          {totalMeals} meal{totalMeals === 1 ? '' : 's'} in your box.
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-panel border border-dashed border-brand-plum/20 bg-white py-20 text-center text-ink/55">
          {availableMeals.length === 0
            ? `No meals are currently available for ${mode === 'subscription' ? 'weekly subscriptions' : 'one-time boxes'}.`
            : 'No meals match that filter this week.'}
        </p>
      ) : (
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((meal) => (
            <MealCard key={meal.id} meal={meal} onSelect={setSelected} mode={mode} />
          ))}
        </div>
      )}

      <MealModal meal={selected && availableMeals.some((meal) => meal.id === selected.id) ? selected : null} onClose={() => setSelected(null)} />
    </div>
  );
}
