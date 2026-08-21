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
      <p className="rounded-control border border-moss-600/15 bg-moss-50 p-4 text-sm leading-6 text-moss-700" role="status">
        Check your email — we sent a sign-in link to <strong>{email}</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => signInWithProvider('google')}
          className="admin-secondary-button w-full"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => signInWithProvider('apple')}
          className="admin-secondary-button w-full"
        >
          Continue with Apple
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs font-medium text-ink/45">
        <div className="h-px flex-1 bg-brand-plum/10" />
        or
        <div className="h-px flex-1 bg-brand-plum/10" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-3">
        <label htmlFor="sign-in-email" className="admin-label">Email address</label>
        <input
          id="sign-in-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          aria-describedby={status === 'error' ? 'sign-in-error' : undefined}
          aria-invalid={status === 'error'}
          className="admin-field mt-0"
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          className="admin-primary-button w-full"
        >
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
        {status === 'error' && (
          <p id="sign-in-error" className="rounded-control bg-[#fff1ed] p-3 text-sm text-[#8f3020]" role="alert">{errorMessage || 'Something went wrong—try again.'}</p>
        )}
      </form>
    </div>
  );
}
