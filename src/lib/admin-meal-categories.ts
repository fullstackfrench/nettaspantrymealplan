import type { Meal } from './types';

export const ADMIN_MEAL_CATEGORIES = [
  { id: 'breakfast', label: 'Breakfast & Brunch' },
  { id: 'main-dishes', label: 'Main Dishes' },
  { id: 'salads-bowls', label: 'Salads & Bowls' },
  { id: 'sides', label: 'Sides' },
  { id: 'desserts', label: 'Desserts' },
  { id: 'soups', label: 'Soups & Stews' },
] as const;

export function getAdminMealCategory(meal: Pick<Meal, 'name' | 'tags'>): string {
  if (meal.tags.includes('uncategorized')) return 'uncategorized';
  const assigned = ADMIN_MEAL_CATEGORIES.find((category) => meal.tags.includes(category.id));
  if (assigned) return assigned.id;
  // Older meals have no category. Suggest a broad dish type without inferring
  // dietary or allergen claims; admins can override it in the meal editor.
  const name = meal.name.toLowerCase();
  if (/frittata|hash|waffle|huevos|pancake|quiche|deviled egg/.test(name)) return 'breakfast';
  if (/pudding|cupcake|cookie|fruit pie/.test(name)) return 'desserts';
  if (/soup|stew\b/.test(name)) return 'soups';
  if (/salad|bowl/.test(name)) return 'salads-bowls';
  if (/green bean|okra|corn$|carrot|potato|veggie medley|beets|rice & peas|squash casserole/.test(name)) return 'sides';
  if (/chicken|fish|cod|shrimp|pasta|noodle|tofu|pie|flatbread|wrap|empanada|masala|lo mein|fried rice/.test(name)) return 'main-dishes';
  return 'uncategorized';
}

export function isAdminMealCategoryTag(tag: string) {
  return tag === 'uncategorized' || ADMIN_MEAL_CATEGORIES.some((category) => category.id === tag);
}

export function matchesAdminMealSearch(meal: Pick<Meal, 'name' | 'subtitle' | 'description' | 'ingredients' | 'tags'>, query: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const haystack = normalize([meal.name, meal.subtitle, meal.description, ...meal.ingredients, ...meal.tags].filter(Boolean).join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}
