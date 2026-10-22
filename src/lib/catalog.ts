import 'server-only';

import { createServerClient } from '@/lib/supabase/server';
import type { Meal, MealSize, PublicSubscriptionPlan } from '@/lib/types';

export async function getWeeklyMenuMeals(): Promise<Meal[]> {
  const supabase = createServerClient();
  const { data: menu, error: menuError } = await supabase
    .from('weekly_menus')
    .select('id')
    .eq('is_published', true)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (menuError) throw menuError;
  if (!menu) return [];

  const { data: items, error: itemsError } = await supabase
    .from('weekly_menu_items')
    .select('meal_id')
    .eq('menu_id', menu.id)
    .eq('sold_out', false);
  if (itemsError) throw itemsError;
  const included = new Set((items ?? []).map((item) => item.meal_id));
  if (included.size === 0) return [];

  const meals = await getPublicMeals();
  return meals.filter((meal) => included.has(meal.id));
}

export async function getPublicMeals(): Promise<Meal[]> {
  const supabase = createServerClient();
  const { data: mealRows, error: mealError } = await supabase
    .from('meals')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (mealError) throw mealError;

  const meals = (mealRows ?? []) as Meal[];
  if (meals.length === 0) return [];

  const { data: sizeRows, error: sizeError } = await supabase
    .from('meal_sizes')
    .select('*')
    .in('meal_id', meals.map((meal) => meal.id))
    .eq('is_active', true)
    .not('servings', 'is', null)
    .or('is_available_for_one_time.eq.true,is_available_for_subscription.eq.true')
    .order('sort_order');
  if (sizeError) throw sizeError;

  const sizesByMeal = new Map<string, MealSize[]>();
  for (const size of (sizeRows ?? []) as MealSize[]) {
    const sizes = sizesByMeal.get(size.meal_id) ?? [];
    sizes.push(size);
    sizesByMeal.set(size.meal_id, sizes);
  }

  return meals.map((meal) => ({ ...meal, meal_sizes: sizesByMeal.get(meal.id) ?? [] }));
}

export async function getPublicMealBySlug(slug: string): Promise<Meal | null> {
  const meals = await getPublicMeals();
  return meals.find((meal) => meal.slug === slug) ?? null;
}

export async function getActiveSubscriptionPlans(): Promise<PublicSubscriptionPlan[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(
      'id, code, name, blurb, included_credits, price_cents, billing_interval, billing_interval_count'
    )
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as PublicSubscriptionPlan[];
}
