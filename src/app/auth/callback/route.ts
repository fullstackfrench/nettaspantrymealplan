import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { afterAuth, safeRedirect } from '../after-auth';

// OAuth (Google/Apple) lands here with a `code` param. Magic link uses
// /auth/confirm instead — it delivers a token_hash, not a code.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirect(searchParams.get('next'), '');

  if (code) {
    const supabase = createSessionClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const role = await afterAuth(data.user);
      return NextResponse.redirect(`${origin}${next || (role === 'admin' ? '/admin' : '/menu')}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
