import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WEEKLY_CUTOFF_MESSAGE } from '../ordering-policy';

export async function weeklyOrderingPolicy(admin: SupabaseClient) {
  const result = await admin.rpc('weekly_ordering_policy');
  if (result.error) throw new Error('Unable to check current ordering availability. Please try again shortly.');
  return (Array.isArray(result.data) ? result.data[0] : result.data) as
    { menu_id: string; week_start: string; closes_at: string; ordering_open: boolean } | null;
}

export async function assertWeeklyOrderingOpen(admin: SupabaseClient, weekStart?: string | null) {
  const policy = await weeklyOrderingPolicy(admin);
  if (!policy?.ordering_open) throw new Error(WEEKLY_CUTOFF_MESSAGE + ' Please wait for the next published menu.');
  if (weekStart && weekStart !== policy.week_start) {
    const result = await admin.rpc('weekly_menu_accepts_orders', { p_week_start: weekStart });
    if (result.error) throw new Error('Unable to check current ordering availability. Please try again shortly.');
    if (!result.data) throw new Error(WEEKLY_CUTOFF_MESSAGE);
  }
  return policy;
}
