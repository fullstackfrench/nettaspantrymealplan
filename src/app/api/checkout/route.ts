import { createOrderCheckout } from '@/lib/account/payments';
import { afterAuth } from '@/app/auth/after-auth';
import { meetsOrderMinimum, MINIMUM_ORDER_MESSAGE } from '@/lib/minimum-order';
import { assertSelectionMinimum } from '@/lib/account/minimum-order';
import { assertWeeklyOrderingOpen } from '@/lib/account/ordering-policy';
import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
import {
  DELIVERY_FEE_CENTS,
  normalizeDeliveryZip,
  isInDeliveryArea,
} from '@/lib/constants';

export const runtime = 'nodejs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ValidRequest = {
  checkoutPreparationId: string;
  mode: 'one_time' | 'subscription';
  subscriptionPlanId: string | null;
  customer: {
    name: string;
    email: string;
    zip: string;
    address_line1: string;
    address_line2: string;
    city: string;
    delivery_notes: string;
  };
  items: { mealId: string; mealSizeId: string; quantity: number }[];
};

function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function parseRequest(value: unknown): ValidRequest | string {
  if (!value || typeof value !== 'object') return 'Invalid checkout request.';
  const body = value as Record<string, unknown>;
  const mode = body.mode;
  if (mode !== 'one_time' && mode !== 'subscription')
    return 'Invalid order mode.';
  if (
    typeof body.checkoutPreparationId !== 'string' ||
    !UUID_PATTERN.test(body.checkoutPreparationId)
  ) {
    return 'Invalid checkout preparation ID.';
  }

  const rawPlanId = body.subscriptionPlanId;
  if (mode === 'subscription') {
    if (typeof rawPlanId !== 'string' || !UUID_PATTERN.test(rawPlanId)) {
      return 'A valid subscription plan is required.';
    }
  } else if (rawPlanId != null) {
    return 'One-time orders cannot include a subscription plan.';
  }

  if (!body.customer || typeof body.customer !== 'object')
    return 'Customer details are required.';
  const customer = body.customer as Record<string, unknown>;
  const name = typeof customer.name === 'string' ? customer.name.trim() : '';
  const email =
    typeof customer.email === 'string'
      ? customer.email.trim().toLowerCase()
      : '';
  const zip = typeof customer.zip === 'string' ? normalizeDeliveryZip(customer.zip) ?? '' : '';
  if (customer.state != null && customer.state !== 'NC') return 'We only deliver within North Carolina.';
  if (!name || name.length > 200) return 'A valid customer name is required.';
  if (!EMAIL_PATTERN.test(email) || email.length > 320)
    return 'A valid email address is required.';
  const address_line1 =
    typeof customer.address_line1 === 'string'
      ? customer.address_line1.trim()
      : '';
  const address_line2 =
    typeof customer.address_line2 === 'string'
      ? customer.address_line2.trim()
      : '';
  const city = typeof customer.city === 'string' ? customer.city.trim() : '';
  const delivery_notes =
    typeof customer.delivery_notes === 'string'
      ? customer.delivery_notes.trim()
      : '';
  if (
    !address_line1 ||
    address_line1.length > 200 ||
    !city ||
    city.length > 200 ||
    address_line2.length > 200 ||
    delivery_notes.length > 2000
  )
    return 'Enter your delivery street address and city.';
  if (!isInDeliveryArea(zip))
    return 'We only deliver within North Carolina right now.';

  if (!Array.isArray(body.items) || body.items.length === 0)
    return 'Your order is empty.';
  if (body.items.length > 100)
    return 'This order contains too many distinct items.';
  const items: ValidRequest['items'] = [];
  const identities = new Set<string>();
  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== 'object') return 'Invalid order item.';
    const item = rawItem as Record<string, unknown>;
    if (typeof item.mealId !== 'string' || !UUID_PATTERN.test(item.mealId))
      return 'Invalid meal ID.';
    if (
      typeof item.mealSizeId !== 'string' ||
      !UUID_PATTERN.test(item.mealSizeId)
    )
      return 'Invalid meal-size ID.';
    if (
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) <= 0 ||
      (item.quantity as number) > 1000
    )
      return 'Quantities must be positive whole numbers within the allowed limit.';
    const identity = `${item.mealId}:${item.mealSizeId}`;
    if (identities.has(identity)) return 'Duplicate order item.';
    identities.add(identity);
    items.push({
      mealId: item.mealId,
      mealSizeId: item.mealSizeId,
      quantity: item.quantity as number,
    });
  }

  return {
    checkoutPreparationId: body.checkoutPreparationId,
    mode,
    subscriptionPlanId: mode === 'subscription' ? (rawPlanId as string) : null,
    customer: {
      name,
      email,
      zip,
      address_line1,
      address_line2,
      city,
      delivery_notes,
    },
    items,
  };
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return invalid('Invalid checkout request.');
  }

  const parsed = parseRequest(rawBody);
  if (typeof parsed === 'string') return invalid(parsed);

  const sessionClient = createSessionClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return NextResponse.json(
      { error: 'Unable to verify the current session.' },
      { status: 401 },
    );
  }

  if (!process.env.STRIPE_SECRET_KEY)
    return NextResponse.json(
      { error: 'Payments are currently unavailable. Please try again later.' },
      { status: 503 },
    );
  if (user) {
    if (!user.email_confirmed_at)
      return NextResponse.json(
        { error: 'Verify your email before placing an account order.' },
        { status: 401 },
      );
    await afterAuth(user);
  }
  const canonical = JSON.stringify({
    authUserId: user?.id ?? null,
    mode: parsed.mode,
    subscriptionPlanId: parsed.subscriptionPlanId,
    customer: parsed.customer,
    items: [...parsed.items].sort((a, b) =>
      `${a.mealId}:${a.mealSizeId}`.localeCompare(
        `${b.mealId}:${b.mealSizeId}`,
      ),
    ),
  });
  const fingerprint = createHash('sha256').update(canonical).digest('hex');
  const admin = createAdminClient();
  try { await assertWeeklyOrderingOpen(admin); }
  catch (error) { return invalid(error instanceof Error ? error.message : 'Ordering is closed.'); }
  if (parsed.mode === 'one_time') {
    try { await assertSelectionMinimum(admin, parsed.items); }
    catch (error) { return invalid(error instanceof Error ? error.message : MINIMUM_ORDER_MESSAGE); }
  }
  const { data, error } = await admin.rpc('prepare_checkout_order', {
    p_checkout_key: parsed.checkoutPreparationId,
    p_request_fingerprint: fingerprint,
    p_mode: parsed.mode,
    p_subscription_plan_id: parsed.subscriptionPlanId,
    p_contact_name: parsed.customer.name,
    p_contact_email: parsed.customer.email,
    p_delivery_zip: parsed.customer.zip,
    p_auth_user_id: user?.id ?? null,
    p_account_email: user?.email ?? null,
    p_items: parsed.items.map((item) => ({
      meal_id: item.mealId,
      meal_size_id: item.mealSizeId,
      quantity: item.quantity,
    })),
    p_deposit_per_container_cents: 0,
    p_delivery_fee_cents: DELIVERY_FEE_CENTS,
  });

  if (error) {
    if (error.code === 'P0001') return invalid(error.message);
    if (error.code === '23505')
      return invalid(
        'These checkout details conflict with an existing customer or preparation.',
      );
    console.error('Checkout preparation failed', {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: 'Unable to prepare this order right now.' },
      { status: 500 },
    );
  }

  const prepared = Array.isArray(data) ? data[0] : data;
  if (!prepared)
    return NextResponse.json(
      { error: 'Order preparation returned no result.' },
      { status: 500 },
    );
  if (!meetsOrderMinimum(prepared.subtotal_cents)) return invalid(MINIMUM_ORDER_MESSAGE);
  const lookup = await admin
    .from('orders')
    .select('customer_id,glass_fee_cents')
    .eq('id', prepared.order_id)
    .single();
  if (lookup.error || !lookup.data)
    return NextResponse.json(
      { error: 'Unable to load this order.' },
      { status: 500 },
    );
  const updated = await admin
    .from('orders')
    .update({
      delivery_address_line1: parsed.customer.address_line1,
      delivery_address_line2: parsed.customer.address_line2,
      delivery_city: parsed.customer.city,
      delivery_zip: parsed.customer.zip,
      delivery_notes: parsed.customer.delivery_notes,
    })
    .eq('id', prepared.order_id);
  if (updated.error)
    return NextResponse.json(
      { error: 'Unable to save your delivery address.' },
      { status: 500 },
    );
  let url: string;
  try {
    url = await createOrderCheckout(
      prepared.order_id,
      lookup.data.customer_id,
      `/checkout/success?order=${prepared.order_id}`,
      Boolean(user),
    );
  } catch (error) {
    console.error('Payment checkout failed', error);
    return NextResponse.json(
      {
        error:
          'Unable to open payment checkout. Please retry; your order will not be duplicated.',
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    url,
    orderId: prepared.order_id,
    subtotalCents: prepared.subtotal_cents,
    depositCents: prepared.deposit_cents,
    glassFeeCents: lookup.data.glass_fee_cents,
    deliveryFeeCents: prepared.delivery_fee_cents,
    totalCents: prepared.total_cents,
    containers: prepared.containers,
    paymentStatus: prepared.payment_status,
    fulfillmentStatus: prepared.fulfillment_status,
  });
}
