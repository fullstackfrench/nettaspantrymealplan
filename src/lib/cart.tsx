'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEPOSIT_PER_CONTAINER_CENTS } from './constants';
import type { Meal, MealSize, PublicSubscriptionPlan } from './types';

export type OrderMode = 'subscription' | 'one_time';

type DisplayMeal = {
  mealName: string;
  mealSlug: string;
  imageUrl: string | null;
  sizeLabel: string;
  servings: number;
};

export type CartLine =
  | {
      id: string;
      kind: 'one_time';
      mealId: string;
      mealSizeId: string;
      quantity: number;
      display: DisplayMeal & { unitPriceCents: number };
    }
  | {
      id: string;
      kind: 'subscription';
      mealId: string;
      mealSizeId: string;
      quantity: number;
      display: DisplayMeal;
    };

export type SelectedPlan = {
  id: string;
  code: string;
  name: string;
  includedCredits: number;
  priceCents: number;
  billingInterval: PublicSubscriptionPlan['billing_interval'];
  billingIntervalCount: number;
};

interface CartState {
  mode: OrderMode;
  changeMode: (mode: OrderMode) => void;
  selectedPlan: SelectedPlan | null;
  selectPlan: (plan: PublicSubscriptionPlan) => void;
  lines: CartLine[];
  addOneTime: (meal: Meal, size: MealSize) => void;
  addSubscription: (meal: Meal, size: MealSize) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  totalMeals: number;
  remaining: number;
  subtotalCents: number;
  depositCents: number;
  totalCents: number;
  chargeDeposit: boolean;
  setChargeDeposit: (value: boolean) => void;
}

const CartContext = createContext<CartState | null>(null);

function displayMeal(meal: Meal, size: MealSize): DisplayMeal {
  if (size.servings == null) throw new Error('This meal size is not ready for purchase.');
  return {
    mealName: meal.name,
    mealSlug: meal.slug,
    imageUrl: meal.image_url,
    sizeLabel: size.label,
    servings: size.servings,
  };
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<OrderMode>('subscription');
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [chargeDeposit, setChargeDeposit] = useState(true);

  const totalMeals = lines.reduce((sum, line) => sum + line.quantity, 0);

  function changeMode(nextMode: OrderMode) {
    if (nextMode === mode) return;
    if (lines.length > 0 && !window.confirm('Switching order type will clear your current selections. Continue?')) {
      return;
    }
    setLines([]);
    setMode(nextMode);
  }

  function selectPlan(plan: PublicSubscriptionPlan) {
    const next = {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      includedCredits: plan.included_credits,
      priceCents: plan.price_cents,
      billingInterval: plan.billing_interval,
      billingIntervalCount: plan.billing_interval_count,
    };
    if (selectedPlan?.id !== next.id && lines.length > 0) {
      if (!window.confirm('Changing plans will clear your current meal selections. Continue?')) return;
      setLines([]);
    }
    setSelectedPlan(next);
  }

  function addOneTime(meal: Meal, size: MealSize) {
    if (
      mode !== 'one_time' ||
      !meal.is_available_for_one_time ||
      !size.is_active ||
      !size.is_available_for_one_time ||
      size.servings == null
    ) return;
    const id = `one_time:${size.id}`;
    setLines((current) => {
      const found = current.find((line) => line.id === id);
      if (found) return current.map((line) => line.id === id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
        id,
        kind: 'one_time',
        mealId: meal.id,
        mealSizeId: size.id,
        quantity: 1,
        display: { ...displayMeal(meal, size), unitPriceCents: size.price_cents },
      }];
    });
  }

  function addSubscription(meal: Meal, size: MealSize) {
    if (
      mode !== 'subscription' ||
      !selectedPlan ||
      totalMeals >= selectedPlan.includedCredits ||
      !meal.is_available_for_subscription ||
      !size.is_active ||
      !size.is_available_for_subscription ||
      size.servings == null
    ) return;
    const id = `subscription:${meal.id}:${size.id}`;
    setLines((current) => {
      const found = current.find((line) => line.id === id);
      if (found) return current.map((line) => line.id === id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
        id,
        kind: 'subscription',
        mealId: meal.id,
        mealSizeId: size.id,
        quantity: 1,
        display: displayMeal(meal, size),
      }];
    });
  }

  function remove(lineId: string) {
    setLines((current) => current
      .map((line) => line.id === lineId ? { ...line, quantity: line.quantity - 1 } : line)
      .filter((line) => line.quantity > 0));
  }

  const value = useMemo<CartState>(() => {
    const subtotalCents = mode === 'subscription'
      ? selectedPlan?.priceCents ?? 0
      : lines.reduce((sum, line) => sum + (line.kind === 'one_time' ? line.quantity * line.display.unitPriceCents : 0), 0);
    const depositCents = chargeDeposit ? totalMeals * DEPOSIT_PER_CONTAINER_CENTS : 0;
    return {
      mode,
      changeMode,
      selectedPlan,
      selectPlan,
      lines,
      addOneTime,
      addSubscription,
      remove,
      clear: () => setLines([]),
      totalMeals,
      remaining: mode === 'subscription' && selectedPlan
        ? Math.max(0, selectedPlan.includedCredits - totalMeals)
        : 0,
      subtotalCents,
      depositCents,
      totalCents: subtotalCents + depositCents,
      chargeDeposit,
      setChargeDeposit,
    };
  }, [mode, selectedPlan, lines, totalMeals, chargeDeposit]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
