import { getAdminMealCategory } from './admin-meal-categories';
import type { Meal } from './types';

export type SubscriptionKind = 'side' | 'entree';

export function getSubscriptionKind(meal: Pick<Meal, 'name' | 'tags'>): SubscriptionKind | null {
  const category = getAdminMealCategory(meal);
  if (category === 'sides') return 'side';
  return ['main-dishes', 'breakfast', 'soups', 'salads-bowls'].includes(category) ? 'entree' : null;
}

export function subscriptionMix(items: { quantity: number; kind: SubscriptionKind | null }[], required: number) {
  const sides = items.reduce((sum, item) => sum + (item.kind === 'side' ? item.quantity : 0), 0);
  const entrees = items.reduce((sum, item) => sum + (item.kind === 'entree' ? item.quantity : 0), 0);
  const half = required / 2;
  const valid = required > 0 && Number.isInteger(half) && items.every((item) =>
    item.kind !== null && Number.isSafeInteger(item.quantity) && item.quantity > 0
  ) && sides === half && entrees === half;
  return { sides, entrees, half, valid };
}
