import type { AdminDashboardData } from '@/lib/admin-dashboard';

export default function TopMealsChart({ meals }: { meals: AdminDashboardData['topMeals'] }) {
  const max = Math.max(...meals.map((meal) => meal.quantity), 1);
  return (
    <section className="admin-card p-5 sm:p-6" aria-labelledby="top-meals-heading">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-brick">Kitchen favorites</p>
      <h3 id="top-meals-heading" className="mt-1 font-display text-xl font-bold text-brand-plum">Top meals</h3>
      <p className="mt-2 text-sm leading-6 text-ink/55">Meal units from paid orders, all time. Historical names are preserved.</p>
      {meals.length === 0 ? (
        <p className="mt-6 rounded-panel border border-dashed border-brand-plum/15 bg-cream/50 px-5 py-12 text-center text-sm leading-6 text-ink/55">Paid-order analytics will appear here once orders are completed.</p>
      ) : (
        <ol className="mt-6 space-y-5">
          {meals.map((meal, index) => (
            <li key={meal.name}>
              <div className="mb-2 flex items-start justify-between gap-4 text-sm">
                <span className="font-bold text-brand-plum"><span className="mr-2 text-brand-gold">{index + 1}</span>{meal.name}</span>
                <span className="shrink-0 font-bold text-ink/65">{meal.quantity} unit{meal.quantity === 1 ? '' : 's'}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-brand-plum/10"><div className="h-full rounded-full bg-brand-brick" style={{ width: `${(meal.quantity / max) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
