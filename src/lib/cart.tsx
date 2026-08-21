'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEPOSIT_PER_CONTAINER_CENTS,
  ONE_TIME_PRICE_CENTS,
  PLANS,
  type PlanSize,
} from './constants';
import type { Meal } from './types';

export type OrderMode = 'subscription' | 'one_time';

export interface CartLine {
  meal: Meal;
  quantity: number;
}

interface CartState {
  mode: OrderMode;
  setMode: (m: OrderMode) => void;
  planSize: PlanSize;
  setPlanSize: (s: PlanSize) => void;
  lines: CartLine[];
  add: (meal: Meal) => void;
  remove: (mealId: string) => void;
  clear: () => void;
  totalMeals: number;
  /** Meals still needed to fill the chosen plan. 0 when full. */
  remaining: number;
  perMealCents: number;
  subtotalCents: number;
  depositCents: number;
  totalCents: number;
  /** Set false once we know the customer already holds a set of containers. */
  chargeDeposit: boolean;
  setChargeDeposit: (v: boolean) => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<OrderMode>('subscription');
  const [planSize, setPlanSize] = useState<PlanSize>(8);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [chargeDeposit, setChargeDeposit] = useState(true);

  const totalMeals = lines.reduce((sum, l) => sum + l.quantity, 0);

  function add(meal: Meal) {
    // On a subscription, don't let them exceed the plan they're paying for.
    if (mode === 'subscription' && totalMeals >= planSize) return;
    setLines((prev) => {
      const found = prev.find((l) => l.meal.id === meal.id);
      if (found) {
        return prev.map((l) =>
          l.meal.id === meal.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { meal, quantity: 1 }];
    });
  }

  function remove(mealId: string) {
    setLines((prev) =>
      prev
        .map((l) => (l.meal.id === mealId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  const value = useMemo<CartState>(() => {
    const perMealCents =
      mode === 'subscription'
        ? PLANS.find((p) => p.size === planSize)!.subscriptionPriceCents
        : ONE_TIME_PRICE_CENTS;

    const subtotalCents = lines.reduce(
      (sum, l) => sum + l.quantity * perMealCents,
      0
    );

    // One container per meal.
    const depositCents = chargeDeposit
      ? totalMeals * DEPOSIT_PER_CONTAINER_CENTS
      : 0;

    return {
      mode,
      setMode,
      planSize,
      setPlanSize,
      lines,
      add,
      remove,
      clear: () => setLines([]),
      totalMeals,
      remaining: mode === 'subscription' ? Math.max(0, planSize - totalMeals) : 0,
      perMealCents,
      subtotalCents,
      depositCents,
      totalCents: subtotalCents + depositCents,
      chargeDeposit,
      setChargeDeposit,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, planSize, lines, totalMeals, chargeDeposit]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
