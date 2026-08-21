import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';
import {
  DEPOSIT_PER_CONTAINER_CENTS,
  ONE_TIME_PRICE_CENTS,
  PLANS,
  isInDeliveryArea,
} from '@/lib/constants';

interface Body {
  mode: 'subscription' | 'one_time';
  planSize: number;
  zip: string;
  email: string;
  name: string;
  items: { mealId: string; quantity: number }[];
}

export async function POST(req: Request) {
  const body = (await req.json()) as Body;

  // --- Validate ---
  if (!isInDeliveryArea(body.zip)) {
    return NextResponse.json(
      { error: 'We only deliver within North Carolina right now.' },
      { status: 400 }
    );
  }
  if (!body.items?.length) {
    return NextResponse.json({ error: 'Your order is empty.' }, { status: 400 });
  }

  const totalMeals = body.items.reduce((s, i) => s + i.quantity, 0);
  if (body.mode === 'subscription' && totalMeals !== body.planSize) {
    return NextResponse.json(
      { error: `A ${body.planSize}-meal plan needs exactly ${body.planSize} meals.` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // --- Price on the server. Never trust prices sent by the browser. ---
  const perMealCents =
    body.mode === 'subscription'
      ? PLANS.find((p) => p.size === body.planSize)?.subscriptionPriceCents
      : ONE_TIME_PRICE_CENTS;

  if (!perMealCents) {
    return NextResponse.json({ error: 'Unknown plan size.' }, { status: 400 });
  }

  // --- Find or create the customer ---
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('email', body.email)
    .maybeSingle();

  let customer = existing;
  if (!customer) {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({ email: body.email, full_name: body.name, zip: body.zip, state: 'NC' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    customer = created;
  }

  // --- Deposit: only charge for containers they don't already hold ---
  // A returning subscriber with a full set out already paid; they just swap.
  const containersAlreadyHeld = customer!.containers_out ?? 0;
  const containersToCharge = Math.max(0, totalMeals - containersAlreadyHeld);
  const depositCents = containersToCharge * DEPOSIT_PER_CONTAINER_CENTS;

  const subtotalCents = totalMeals * perMealCents;

  // --- Create the order in a pending state ---
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      customer_id: customer!.id,
      order_type: body.mode,
      status: 'pending',
      subtotal_cents: subtotalCents,
      deposit_cents: depositCents,
      total_cents: subtotalCents + depositCents,
      containers_issued: totalMeals,
    })
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  await supabase.from('order_items').insert(
    body.items.map((i) => ({
      order_id: order.id,
      meal_id: i.mealId,
      quantity: i.quantity,
      unit_price_cents: perMealCents,
    }))
  );

  // --- Stripe ---
  // Without a key configured we stop here so the flow is still testable.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      url: `/checkout/success?order=${order.id}&demo=1`,
      warning: 'STRIPE_SECRET_KEY not set — order recorded but no payment taken.',
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: totalMeals,
      price_data: {
        currency: 'usd',
        unit_amount: perMealCents,
        product_data: { name: "Netta's Pantry meal" },
        ...(body.mode === 'subscription' ? { recurring: { interval: 'week' as const } } : {}),
      },
    },
  ];

  // The deposit is a one-off charge even on a subscription, so it goes in as a
  // separate non-recurring line item.
  if (depositCents > 0) {
    lineItems.push({
      quantity: containersToCharge,
      price_data: {
        currency: 'usd',
        unit_amount: DEPOSIT_PER_CONTAINER_CENTS,
        product_data: {
          name: 'Refundable glass container deposit',
          description: 'Fully refunded when containers are returned.',
        },
      },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: body.mode === 'subscription' ? 'subscription' : 'payment',
    customer_email: body.email,
    line_items: lineItems,
    success_url: `${siteUrl}/checkout/success?order=${order.id}`,
    cancel_url: `${siteUrl}/checkout`,
    metadata: { order_id: order.id, customer_id: customer!.id },
  });

  await supabase
    .from('orders')
    .update({ stripe_payment_intent_id: session.id })
    .eq('id', order.id);

  return NextResponse.json({ url: session.url });
}
