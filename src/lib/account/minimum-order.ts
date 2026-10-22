import type { SupabaseClient } from '@supabase/supabase-js';
import { assertOrderMinimum } from '../minimum-order';

type Item = { mealId: string; mealSizeId: string; quantity: number };

/** Use server prices, preserving unchanged order lines at their original prices. */
export async function assertSelectionMinimum(
  admin: SupabaseClient,
  items: Item[],
  existingOrderId?: string,
) {
  const { data: sizes, error } = await admin.from('meal_sizes')
    .select('id,meal_id,price_cents').in('id', items.map((item) => item.mealSizeId));
  if (error) throw new Error('Unable to verify meal prices. Please try again.');
  const original = existingOrderId ? await admin.from('order_items')
    .select('meal_id,meal_size_id,quantity,unit_price_cents').eq('order_id', existingOrderId)
    : { data: [], error: null };
  if (original.error) throw new Error('Unable to verify the original order prices.');
  let subtotal = 0;
  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000)
      throw new Error('Enter positive whole-number quantities.');
    const size = sizes?.find((size) => size.id === item.mealSizeId && size.meal_id === item.mealId);
    if (!size) throw new Error('One or more selected meals are unavailable.');
    const snapshot = original.data?.find((line) => line.meal_id === item.mealId &&
      line.meal_size_id === item.mealSizeId && line.quantity === item.quantity);
    subtotal += (snapshot?.unit_price_cents ?? size.price_cents) * item.quantity;
  }
  assertOrderMinimum(subtotal);
}
