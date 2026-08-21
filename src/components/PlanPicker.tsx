'use client';

import { PLANS, ONE_TIME_PRICE_CENTS, formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';

export default function PlanPicker() {
  const { mode, setMode, planSize, setPlanSize } = useCart();

  return (
    <section className="rounded-panel border border-brand-plum/10 bg-white p-4 shadow-soft sm:p-6" aria-labelledby="order-style-heading">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">First, set your order style</p>
          <h2 id="order-style-heading" className="mt-1 font-display text-xl font-bold text-brand-plum">How are you filling your table?</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <ModeTab active={mode === 'subscription'} onClick={() => setMode('subscription')}>
          Weekly subscription
        </ModeTab>
        <ModeTab active={mode === 'one_time'} onClick={() => setMode('one_time')}>
          One-time box
        </ModeTab>
        </div>
      </div>

      {mode === 'subscription' ? (
        <>
          <p className="mt-5 text-sm text-ink/60">
            Choose a plan size. Skip or cancel any week.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {PLANS.map((p) => {
              const isActive = planSize === p.size;
              return (
                <button
                  key={p.size}
                  onClick={() => setPlanSize(p.size)}
                  className={[
                    'min-h-[92px] rounded-control p-4 text-left transition',
                    isActive
                      ? 'bg-brand-plum/5 ring-2 ring-brand-plum'
                      : 'bg-cream/50 ring-1 ring-brand-plum/15 hover:ring-brand-plum/35',
                  ].join(' ')}
                >
                  <div className="font-display text-lg font-bold text-brand-plum">{p.label}</div>
                  <div className="mt-1 text-sm text-ink/65">
                    {formatCents(p.subscriptionPriceCents)} per meal
                  </div>
                  <div className="mt-1 text-xs font-medium text-moss-700">{p.blurb}</div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-control bg-cream p-4 text-sm leading-6 text-ink/65">
          Order as many meals as you like at {formatCents(ONE_TIME_PRICE_CENTS)} each — no
          commitment. Subscribe instead to save up to{' '}
          {formatCents(ONE_TIME_PRICE_CENTS - PLANS[2].subscriptionPriceCents)} per meal.
        </p>
      )}
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold transition sm:px-5',
        active ? 'bg-brand-plum text-white shadow-soft' : 'text-ink/65 ring-1 ring-brand-plum/20 hover:bg-brand-plum/5 hover:text-brand-plum',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
