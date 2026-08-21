import 'server-only';

import { createAdminClient, createSessionClient } from '@/lib/supabase/server';

const UNAUTHORIZED_MESSAGE = 'You are not authorized to perform this action.';

/**
 * Verifies the caller from the server-managed Supabase session before creating
 * a service-role client. Admin email configuration and client input are never
 * used as authorization evidence.
 */
export async function requireAdmin() {
  const sessionClient = createSessionClient();
  const {
    data: { user },
    error: authError,
  } = await sessionClient.auth.getUser();

  if (authError || !user) {
    throw new Error(UNAUTHORIZED_MESSAGE);
  }

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin') {
    throw new Error(UNAUTHORIZED_MESSAGE);
  }

  return createAdminClient();
}
