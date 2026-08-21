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
    <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
      <div className="flex flex-wrap items-center gap-2">
        <ModeTab active={mode === 'subscription'} onClick={() => changeMode('subscription')}>Weekly subscription</ModeTab>
        <ModeTab active={mode === 'one_time'} onClick={() => changeMode('one_time')}>One-time box</ModeTab>
      </div>

      {mode === 'subscription' ? (
        <>
          <p className="mt-4 text-sm text-black/60">Choose a plan. Skip or cancel any week.</p>
          {plans.length === 0 ? (
            <p className="mt-4 text-sm text-clay-500">No subscription plans are currently available.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const active = selectedPlan?.id === plan.id;
                const perMeal = Math.round(plan.price_cents / plan.included_credits);
                return (
                  <button key={plan.id} onClick={() => selectPlan(plan)} className={`rounded-xl p-4 text-left transition ${active ? 'bg-moss-50 ring-2 ring-moss-600' : 'ring-1 ring-black/10 hover:ring-black/25'}`}>
                    <div className="font-display text-lg font-bold">{plan.name}</div>
                    <div className="mt-1 text-sm font-semibold">{formatCents(plan.price_cents)}/{plan.billing_interval}</div>
                    <div className="mt-1 text-xs text-black/60">{formatCents(perMeal)} per meal</div>
                    {plan.blurb && <div className="mt-1 text-xs text-moss-600">{plan.blurb}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-black/60">Choose an available size for each meal. Prices vary by size, with no subscription commitment.</p>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${active ? 'bg-ink text-white' : 'text-black/60 ring-1 ring-black/15 hover:bg-black/5'}`}>{children}</button>;
}
