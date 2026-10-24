"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";

export type HolidayActionState = { error: string | null; saved: boolean };

function money(form: FormData, key: string, optional = false) {
  const raw = String(form.get(key) ?? "").trim();
  if (optional && !raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw))
    throw new Error("Enter dollar amounts with at most two decimal places.");
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(cents) || cents > 10000000)
    throw new Error("That price is too large.");
  return cents;
}

export async function saveHolidaySettings(
  _previous: HolidayActionState,
  form: FormData,
): Promise<HolidayActionState> {
  try {
    const db = await requireAdmin();
    const minimumPeople = Number(form.get("minimum_people"));
    if (
      !Number.isSafeInteger(minimumPeople) ||
      minimumPeople < 1 ||
      minimumPeople > 1000
    )
      throw new Error("Minimum group size must be between 1 and 1,000.");
    const basis = String(form.get("extra_dessert_basis"));
    if (!["person", "order"].includes(basis))
      throw new Error("Choose the dessert pricing basis.");
    const dates = Object.fromEntries(
      [
        "thanksgiving_deadline",
        "thanksgiving_fulfillment",
        "christmas_deadline",
        "christmas_fulfillment",
      ].map((key) => {
        const value = String(form.get(key) ?? "");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
        )
          throw new Error("Enter valid holiday dates.");
        return [key, value];
      }),
    );
    if (
      dates.thanksgiving_deadline >= dates.thanksgiving_fulfillment ||
      dates.christmas_deadline >= dates.christmas_fulfillment
    )
      throw new Error("Order deadlines must be before pickup/delivery dates.");
    const deliveryZips = String(form.get("delivery_zips") ?? "")
      .split(/[\s,]+/)
      .filter(Boolean);
    if (deliveryZips.some((zip) => !/^\d{5}$/.test(zip)))
      throw new Error(
        "Enter five-digit delivery ZIP codes separated by commas.",
      );
    const pickupLocation = String(form.get("pickup_location") ?? "").trim();
    const open = form.get("orders_open") === "on";
    if (open && !pickupLocation && !deliveryZips.length)
      throw new Error(
        "Set a pickup location or at least one delivery ZIP code before opening orders.",
      );
    if (
      open &&
      (!process.env.STRIPE_SECRET_KEY ||
        !process.env.STRIPE_HOLIDAY_WEBHOOK_SECRET)
    )
      throw new Error(
        "Configure Stripe and the holiday webhook before opening orders.",
      );
    const { data, error } = await db
      .from("holiday_settings")
      .update({
        per_person_cents: money(form, "per_person"),
        minimum_order_cents: money(form, "minimum_order"),
        minimum_people: minimumPeople,
        extra_dessert_cents: money(form, "extra_dessert", true),
        extra_dessert_basis: basis,
        delivery_fee_cents: money(form, "delivery_fee"),
        pickup_location: pickupLocation,
        delivery_zips: Array.from(new Set(deliveryZips)),
        orders_open: open,
        ...dates,
      })
      .eq("id", 1)
      .eq("version", Number(form.get("version")))
      .select("id")
      .maybeSingle();
    if (error)
      throw new Error(
        "Settings could not be saved. Check the holiday migration and valid prices.",
      );
    if (!data)
      throw new Error(
        "Settings changed in another tab. Reload this page before saving.",
      );
    revalidatePath("/holiday-cheat-sheet");
    revalidatePath("/admin/holidays");
    return { error: null, saved: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to save settings.",
      saved: false,
    };
  }
}

export async function deliverHolidayOrder(
  _previous: HolidayActionState,
  form: FormData,
): Promise<HolidayActionState> {
  try {
    const db = await requireAdmin();
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid order.");
    const { data, error } = await db
      .from("holiday_orders")
      .update({
        fulfillment_status: "delivered",
        delivered_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("deposit_status", "paid")
      .eq("balance_cents", 0)
      .eq("balance_status", "paid")
      .eq("fulfillment_status", "unfulfilled")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("The order could not be marked delivered.");
    if (!data) {
      const { data: current } = await db
        .from("holiday_orders")
        .select("deposit_status, balance_cents, balance_status, fulfillment_status")
        .eq("id", id)
        .maybeSingle();
      if (
        current?.deposit_status !== "paid" || current.balance_cents !== 0 || current.balance_status !== "paid" ||
        current.fulfillment_status !== "delivered"
      )
        throw new Error("Full payment is required before fulfillment.");
    }
    revalidatePath("/admin/holidays");
    return { saved: true, error: null };
  } catch (error) {
    revalidatePath("/admin/holidays");
    return {
      saved: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to record fulfillment.",
    };
  }
}
