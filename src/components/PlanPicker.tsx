'use client';

import { useEffect } from 'react';
import { formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';
import type { PublicSubscriptionPlan } from '@/lib/types';

export default function PlanPicker({ plans }: { plans: PublicSubscriptionPlan[] }) {
  const { mode, changeMode, selectedPlan, selectPlan } = useCart();

  useEffect(() => {
    if (plans.length === 0) return;
    const stillActive = selectedPlan && plans.some((plan) => plan.id === selectedPlan.id);
    if (!stillActive) {
      const preferred = plans.find((plan) => plan.code === 'weekly-8') ?? plans[0];
      selectPlan(preferred);
    }
  }, [plans, selectedPlan, selectPlan]);

  return (
    <section className="rounded-panel border border-brand-plum/10 bg-white p-4 shadow-soft sm:p-6" aria-labelledby="order-style-heading">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">First, set your order style</p><h2 id="order-style-heading" className="mt-1 font-display text-xl font-bold text-brand-plum">How are you filling your table?</h2></div>
        <div className="flex flex-wrap items-center gap-2">
        <ModeTab active={mode === 'subscription'} onClick={() => changeMode('subscription')}>Weekly subscription</ModeTab>
        <ModeTab active={mode === 'one_time'} onClick={() => changeMode('one_time')}>One-time box</ModeTab>
        </div>
      </div>

      {mode === 'subscription' ? (
        <>
          <p className="mt-5 text-sm text-ink/60">Choose a plan. Skip or cancel any week.</p>
          {plans.length === 0 ? (
            <p className="mt-4 rounded-control bg-clay-100 p-4 text-sm text-brand-brick">No subscription plans are currently available.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                const perMeal = Math.round(plan.price_cents / plan.included_credits);
                return (
                  <button key={plan.id} onClick={() => selectPlan(plan)} aria-pressed={active} className={`min-h-[112px] rounded-control p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-plum ${active ? 'bg-brand-plum/5 ring-2 ring-brand-plum' : 'bg-cream/50 ring-1 ring-brand-plum/15 hover:ring-brand-plum/35'}`}>
                    <div className="font-display text-lg font-bold text-brand-plum">{plan.name}</div>
                    <div className="mt-1 text-sm font-semibold text-ink/70">{formatCents(plan.price_cents)}/{plan.billing_interval}</div>
                    <div className="mt-1 text-xs text-ink/60">{formatCents(perMeal)} per meal</div>
                    {plan.blurb && <div className="mt-1 text-xs text-moss-600">{plan.blurb}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="mt-5 rounded-control bg-cream p-4 text-sm leading-6 text-ink/65">Choose an available size for each meal. Prices vary by size, with no subscription commitment.</p>
      )}
    </section>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} aria-pressed={active} className={`min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-plum sm:px-5 ${active ? 'bg-brand-plum text-white shadow-soft' : 'text-ink/65 ring-1 ring-brand-plum/20 hover:bg-brand-plum/5 hover:text-brand-plum'}`}>{children}</button>;
}
