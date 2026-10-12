import 'server-only';
import Stripe from 'stripe';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';
export async function accountContext() {
  const {
    data: { user },
    error,
  } = await createSessionClient().auth.getUser();
  if (error || !user || !user.email_confirmed_at)
    throw new Error('Sign in with a verified email to manage your account.');
  const admin = createAdminClient();
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();
  if (customerError || !customer)
    throw new Error(
      'Your account could not be loaded. Sign out and sign in again.',
    );
  return { user, customer, admin };
}
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error('Payments are not configured. Please contact Chef Netta.');
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });
}
export function siteOrigin() {
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin) throw new Error('The site URL is not configured.');
  return new URL(origin).origin;
}
