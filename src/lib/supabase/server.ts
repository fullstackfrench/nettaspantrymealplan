import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  createServerClient as createSupabaseSSRClient,
  type CookieOptions,
} from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Session-aware client — anon key, RLS enforced, reads/writes the auth cookie.
 * Use anywhere you need to know who's signed in (auth.getUser(), auth.signOut(),
 * or a query that relies on auth.uid() in an RLS policy).
 */
export function createSessionClient() {
  const cookieStore = cookies();
  return createSupabaseSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — middleware refreshes the
            // session cookie instead, so this can be safely ignored.
          }
        },
      },
    }
  );
}

/**
 * Public server client — anon key, RLS enforced, no cookies. Use for reading
 * the menu in server components where no signed-in user matters.
 */
export function createServerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Admin client — service role key, BYPASSES Row Level Security.
 *
 * SECURITY: only ever call this from server components, server actions, or
 * route handlers. Never import it into a file marked 'use client'. If this key
 * reaches the browser, anyone can read and write your entire database.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}
