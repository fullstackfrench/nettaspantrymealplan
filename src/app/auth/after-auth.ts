import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Runs once per sign-in, right after a session is established (from either the
 * OAuth callback or the magic-link confirm route). Uses the service role since
 * neither step it performs is something the signed-in user's own RLS grants
 * should cover.
 */
export async function afterAuth(user: User): Promise<'customer' | 'admin'> {
  const supabase = createAdminClient();

  // Admin promotion is promotion-only: removing an email from ADMIN_EMAILS
  // later does not demote an existing admin. That's a manual SQL step.
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.id);
  }

  // Link any guest order history placed under this (now-verified) email.
  if (user.email) {
    await supabase
      .from('customers')
      .update({ auth_user_id: user.id })
      .is('auth_user_id', null)
      .ilike('email', user.email);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return profile?.role === 'admin' ? 'admin' : 'customer';
}

/** Only ever redirect to a same-origin path — never let a query param send a user off-site. */
export function safeRedirect(path: string | null, fallback: string): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return fallback;
  return path;
}
