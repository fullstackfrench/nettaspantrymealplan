import type { Meal } from './types';
import { getSubscriptionKind } from './subscription-mix';

export function getAvailableMealSizes(meal: Meal, mode: 'one_time' | 'subscription') {
  if (!meal.is_active) return [];
  if (mode === 'subscription' && !getSubscriptionKind(meal)) return [];
  if (mode === 'one_time' ? !meal.is_available_for_one_time : !meal.is_available_for_subscription) {
    return [];
  }

  const sizes = (meal.meal_sizes ?? []).filter((size) =>
    size.is_active &&
    size.servings != null && Number.isInteger(size.servings) && size.servings > 0 &&
    (mode === 'one_time'
      ? size.is_available_for_one_time && size.price_cents > 0
      : size.is_available_for_subscription)
  );

  return mode === 'subscription' && sizes.length !== 1 ? [] : sizes;
}
