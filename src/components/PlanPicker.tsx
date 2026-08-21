'use client';

import { PLANS, ONE_TIME_PRICE_CENTS, formatCents } from '@/lib/constants';
import { useCart } from '@/lib/cart';

export default function PlanPicker() {
  const { mode, setMode, planSize, setPlanSize } = useCart();

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
      <div className="flex flex-wrap items-center gap-2">
        <ModeTab active={mode === 'subscription'} onClick={() => setMode('subscription')}>
          Weekly subscription
        </ModeTab>
        <ModeTab active={mode === 'one_time'} onClick={() => setMode('one_time')}>
          One-time box
        </ModeTab>
      </div>

      {mode === 'subscription' ? (
        <>
          <p className="mt-4 text-sm text-black/60">
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
                    'rounded-xl p-4 text-left transition',
                    isActive
                      ? 'bg-moss-50 ring-2 ring-moss-600'
                      : 'ring-1 ring-black/10 hover:ring-black/25',
                  ].join(' ')}
                >
                  <div className="font-display text-lg font-bold">{p.label}</div>
                  <div className="mt-1 text-sm text-black/60">
                    {formatCents(p.subscriptionPriceCents)} per meal
                  </div>
                  <div className="mt-1 text-xs text-moss-600">{p.blurb}</div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-black/60">
          Order as many meals as you like at {formatCents(ONE_TIME_PRICE_CENTS)} each — no
          commitment. Subscribe instead to save up to{' '}
          {formatCents(ONE_TIME_PRICE_CENTS - PLANS[2].subscriptionPriceCents)} per meal.
        </p>
      )}
    </div>
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
      className={[
        'rounded-full px-5 py-2.5 text-sm font-semibold transition',
        active ? 'bg-ink text-white' : 'text-black/60 ring-1 ring-black/15 hover:bg-black/5',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
