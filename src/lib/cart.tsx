'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { orderTaxCents } from './sales-tax';
import { usePathname } from 'next/navigation';
import { GLASS_CONTAINER_DEPOSIT_CENTS, MEAL_DELIVERY_FEE_CENTS } from './constants';
import type { Meal, MealSize, PublicSubscriptionPlan } from './types';
import { getSubscriptionKind, subscriptionMix, type SubscriptionKind } from './subscription-mix';

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
      subscriptionKind: SubscriptionKind;
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
  subscriptionSides: number;
  subscriptionEntrees: number;
  subscriptionComplete: boolean;
  canAddSubscription: (meal: Meal) => boolean;
  subtotalCents: number;
  depositCents: number;
  glassFeeCents: number;
  deliveryFeeCents: number;
  taxCents: number;
  orderingOpen: boolean;
  orderingDeadline: string | null;
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
  const pathname = usePathname();
  const [mode, setMode] = useState<OrderMode>('subscription');
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [chargeDeposit, setChargeDeposit] = useState(true);
  const [orderingOpen, setOrderingOpen] = useState(false);
  const [orderingDeadline, setOrderingDeadline] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch('/api/ordering-policy', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unavailable');
        const policy = await response.json();
        if (active) {
          setChargeDeposit(policy.glassFeeCents > 0);
          setOrderingDeadline(policy.closesAt);
          setOrderingOpen(policy.orderingOpen && Date.now() < Date.parse(policy.closesAt));
        }
      } catch { if (active) setOrderingOpen(false); }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { active = false; window.removeEventListener('focus', refresh); window.clearInterval(interval); };
  }, [pathname]);
  useEffect(() => {
    if (!orderingDeadline) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= Date.parse(orderingDeadline)) setOrderingOpen(false);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [orderingDeadline]);


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
      !orderingOpen || mode !== 'one_time' ||
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
    const kind = getSubscriptionKind(meal);
    if (
      !orderingOpen || mode !== 'subscription' ||
      !selectedPlan || !kind ||
      totalMeals >= selectedPlan.includedCredits ||
      !meal.is_available_for_subscription ||
      !size.is_active ||
      !size.is_available_for_subscription ||
      size.servings == null
    ) return;
    const id = `subscription:${meal.id}:${size.id}`;
    setLines((current) => {
      const categoryCount = current.reduce((sum, line) => sum +
        (line.kind === 'subscription' && line.subscriptionKind === kind ? line.quantity : 0), 0);
      if (categoryCount >= selectedPlan.includedCredits / 2) return current;
      const found = current.find((line) => line.id === id);
      if (found) return current.map((line) => line.id === id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
        id,
        kind: 'subscription',
        subscriptionKind: kind,
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
    const mix = subscriptionMix(lines.map((line) => ({ quantity: line.quantity,
      kind: line.kind === 'subscription' ? line.subscriptionKind : null })), selectedPlan?.includedCredits ?? 0);
    const subtotalCents = mode === 'subscription'
      ? selectedPlan?.priceCents ?? 0
      : lines.reduce((sum, line) => sum + (line.kind === 'one_time' ? line.quantity * line.display.unitPriceCents : 0), 0);
    const depositCents = totalMeals > 0 && chargeDeposit ? GLASS_CONTAINER_DEPOSIT_CENTS : 0;
    const deliveryFeeCents = totalMeals > 0 ? MEAL_DELIVERY_FEE_CENTS : 0;
    const taxCents = orderTaxCents([subtotalCents, depositCents, deliveryFeeCents]);
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
      subscriptionSides: mix.sides,
      subscriptionEntrees: mix.entrees,
      subscriptionComplete: mix.valid,
      canAddSubscription: (meal) => {
        const kind = getSubscriptionKind(meal);
        return Boolean(selectedPlan && Number.isInteger(mix.half) && kind &&
          (kind === 'side' ? mix.sides : mix.entrees) < mix.half);
      },
      remaining: mode === 'subscription' && selectedPlan
        ? Math.max(0, selectedPlan.includedCredits - totalMeals)
        : 0,
      subtotalCents,
      depositCents,
      glassFeeCents: depositCents,
      deliveryFeeCents,
      orderingOpen,
      orderingDeadline,
      taxCents,
      totalCents: subtotalCents + depositCents + deliveryFeeCents + taxCents,
      chargeDeposit,
      setChargeDeposit,
    };
  }, [mode, selectedPlan, lines, totalMeals, chargeDeposit, orderingOpen, orderingDeadline]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}
