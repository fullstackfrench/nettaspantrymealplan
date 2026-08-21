'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthForm({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();
    const confirmUrl = new URL('/auth/confirm', window.location.origin);
    if (redirectTo) confirmUrl.searchParams.set('next', redirectTo);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: confirmUrl.toString(),
      },
    });
    if (error) setErrorMessage(error.message);
    setStatus(error ? 'error' : 'sent');
  }

  async function signInWithProvider(provider: 'google' | 'apple') {
    const supabase = createClient();
    const callbackUrl = new URL('/auth/callback', window.location.origin);
    if (redirectTo) callbackUrl.searchParams.set('next', redirectTo);
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });
  }

  if (status === 'sent') {
    return (
      <p className="rounded-xl bg-moss-50 p-4 text-sm">
        Check your email — we sent a sign-in link to <strong>{email}</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => signInWithProvider('google')}
          className="w-full rounded-full px-5 py-3 text-sm font-semibold ring-1 ring-black/15 hover:bg-black/5"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => signInWithProvider('apple')}
          className="w-full rounded-full px-5 py-3 text-sm font-semibold ring-1 ring-black/15 hover:bg-black/5"
        >
          Continue with Apple
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-black/40">
        <div className="h-px flex-1 bg-black/10" />
        or
        <div className="h-px flex-1 bg-black/10" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="w-full rounded-full bg-moss-600 px-5 py-3 text-sm font-semibold text-white hover:bg-moss-700 disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
        {status === 'error' && (
          <p className="text-xs text-clay-500">{errorMessage || 'Something went wrong — try again.'}</p>
        )}
      </form>
    </div>
  );
}
