import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSessionClient } from '@/lib/supabase/server';
import { afterAuth, safeRedirect } from '../after-auth';

// The default Supabase PKCE magic-link flow lands here with a `code`.
// Customized email templates may instead send a token_hash + type, so support
// both callback shapes.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeRedirect(searchParams.get('next'), '');

  const supabase = createSessionClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const role = await afterAuth(data.user);
      return NextResponse.redirect(`${origin}${next || (role === 'admin' ? '/admin' : '/menu')}`);
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.user) {
      const role = await afterAuth(data.user);
      return NextResponse.redirect(`${origin}${next || (role === 'admin' ? '/admin' : '/menu')}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
