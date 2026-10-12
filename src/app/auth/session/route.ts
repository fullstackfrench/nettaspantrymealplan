import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { afterAuth } from '../after-auth';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403 },
    );
  const {
    data: { user },
    error,
  } = await createSessionClient().auth.getUser();
  if (error || !user || !user.email_confirmed_at)
    return NextResponse.json(
      { error: 'Verify your email and sign in to continue.' },
      { status: 401 },
    );
  try {
    return NextResponse.json({ role: await afterAuth(user) });
  } catch {
    return NextResponse.json(
      { error: 'Unable to open your account. Please try again.' },
      { status: 500 },
    );
  }
}
