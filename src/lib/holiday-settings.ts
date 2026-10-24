import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { HOLIDAY_DRAFT_SETTINGS, type HolidaySettings } from "./holiday-menu";

export async function getHolidaySettings(): Promise<{
  settings: HolidaySettings;
  installed: boolean;
}> {
  // Prices and ordering availability must reflect the current database settings.
  const { data, error } = await createServerClient("no-store")
    .from("holiday_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  // The public draft can be previewed before applying the rollout migration.
  // Other database errors are surfaced instead of silently using stale prices.
  if (error && ["42P01", "PGRST205"].includes(error.code)) {
    return { settings: HOLIDAY_DRAFT_SETTINGS, installed: false };
  }
  if (error)
    throw new Error("Holiday pricing could not be loaded. Please try again.");
  return { settings: data ?? HOLIDAY_DRAFT_SETTINGS, installed: Boolean(data) };
}
