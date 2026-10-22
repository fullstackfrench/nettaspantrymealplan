import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Runs once per sign-in, right after a session is established (from either the
 * OAuth callback or the magic-link confirm route). Uses the service role since
 * neither step it performs is something the signed-in user's own RLS grants
 * should cover.
 */
export async function afterAuth(user: User): Promise<'customer' | 'admin'> {
  if (!user.email || !user.email_confirmed_at)
    throw new Error('A verified email is required.');
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

  // Only a server-verified email can claim guest history. Escape ILIKE
  // metacharacters so an email cannot match another customer's address.
  const { data: owned, error: ownedError } = await supabase
    .from('customers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (!owned) {
    const pattern = user.email.replace(/[\\%_]/g, '\\$&');
    const { data: matches, error: matchError } = await supabase
      .from('customers')
      .select('id,auth_user_id')
      .ilike('email', pattern)
      .limit(2);
    if (matchError) throw matchError;
    if ((matches?.length ?? 0) > 1)
      throw new Error(
        'Multiple customer records need to be reconciled. Please contact Chef Netta.',
      );
    const guest = matches?.[0];
    if (guest) {
      if (guest.auth_user_id && guest.auth_user_id !== user.id)
        throw new Error('This customer record is linked to another account.');
      const { error: linkError } = await supabase
        .from('customers')
        .update({ auth_user_id: user.id })
        .eq('id', guest.id)
        .is('auth_user_id', null);
      if (linkError) throw linkError;
    } else {
      const { error: createError } = await supabase
        .from('customers')
        .upsert(
          {
            auth_user_id: user.id,
            email: user.email.toLowerCase(),
            full_name:
              String(user.user_metadata?.full_name ?? '').slice(0, 200) || null,
          },
          { onConflict: 'email', ignoreDuplicates: true },
        );
      if (createError) throw createError;
    }
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
  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\u0000-\u001f]/.test(path)
  )
    return fallback;
  return path;
}
