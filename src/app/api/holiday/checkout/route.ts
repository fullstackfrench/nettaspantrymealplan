import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getHolidaySettings } from "@/lib/holiday-settings";
import { validateHolidayCheckout } from "@/lib/holiday-checkout";
import { holidayOrigin, startHolidayCheckout } from "@/lib/holiday-payments";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== holidayOrigin())
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.STRIPE_HOLIDAY_WEBHOOK_SECRET
  )
    return NextResponse.json(
      { error: "Holiday payments are not available yet." },
      { status: 503 },
    );
  try {
    const raw = await request.text();
    if (raw.length > 10000)
      return NextResponse.json(
        { error: "Order details are too large." },
        { status: 400 },
      );
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("Enter valid order details.");
    const { settings, installed } = await getHolidaySettings();
    if (!installed || !settings.orders_open)
      return NextResponse.json(
        { error: "Holiday ordering is not open yet." },
        { status: 409 },
      );
    const submission = validateHolidayCheckout(body, settings);
    const db = createAdminClient();
    const { data, error } = await db.rpc("prepare_holiday_order", {
      p_key: submission.key,
      p_version: settings.version,
      p_details: submission.details,
      p_total: submission.quote.totalCents,
      p_consent: submission.consent,
    });
    if (error)
      return NextResponse.json(
        {
          error:
            error.code === "P0001"
              ? error.message
              : "Your order could not be prepared. Please try again.",
        },
        { status: 409 },
      );
    if (data.deposit_cents !== submission.quote.totalCents || data.balance_cents !== 0)
      throw new Error("Holiday checkout is being updated. Please try again shortly.");
    const url = await startHolidayCheckout(db, data);
    return NextResponse.json({ url });
  } catch (error) {
    console.error(
      "Holiday checkout failed",
      error instanceof Error ? error.message : "Unknown failure",
    );
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "Enter valid order details."
            : error instanceof Error
              ? error.message
              : "Checkout is unavailable. Please try again.",
      },
      { status: 400 },
    );
  }
}
