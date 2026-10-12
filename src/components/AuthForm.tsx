'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'password' | 'signup' | 'link' | 'forgot';
export default function AuthForm({
  redirectTo,
  googleEnabled = false,
}: {
  redirectTo?: string;
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function finish() {
    const response = await fetch('/auth/session', { method: 'POST' });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? 'Unable to open your account.');
    router.replace(
      redirectTo || (data.role === 'admin' ? '/admin' : '/account'),
    );
    router.refresh();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const supabase = createClient();
    const confirm = new URL('/auth/confirm', window.location.origin);
    confirm.searchParams.set('next', redirectTo || '/account');
    try {
      if (mode === 'password') {
        const result = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (result.error) throw result.error;
        await finish();
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            emailRedirectTo: confirm.toString(),
          },
        });
        if (result.error) throw result.error;
        if (result.data.session) await finish();
        else
          setMessage('Check your email to confirm your account, then sign in.');
      } else if (mode === 'link') {
        const result = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: confirm.toString() },
        });
        if (result.error) throw result.error;
        setMessage(
          'If email sign-in is available for this address, a sign-in link is on its way. Check your inbox.',
        );
      } else {
        confirm.searchParams.set('next', '/account/password');
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: confirm.toString(),
        });
        if (result.error) throw result.error;
        setMessage(
          'If an account exists for this email, a password-reset link is on its way.',
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError('');
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', redirectTo || '/account');
    const result = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
    }
  }
  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
    setPassword('');
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" aria-label="Account access options">
        {(
          [
            ['password', 'Sign in'],
            ['signup', 'Create account'],
            ['link', 'Email me a link'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={mode === value}
            onClick={() => changeMode(value)}
            className={
              mode === value ? 'admin-primary-button' : 'admin-secondary-button'
            }
          >
            {label}
          </button>
        ))}
      </div>
      {googleEnabled && (
        <button
          type="button"
          disabled={busy}
          onClick={google}
          className="admin-secondary-button w-full"
        >
          Continue with Google
        </button>
      )}
      {message && (
        <p
          role="status"
          className="rounded-control bg-moss-50 p-3 text-sm text-moss-700"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-control bg-clay-100 p-3 text-sm text-brand-brick"
        >
          {error}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <label className="admin-label">
            Full name
            <input
              className="admin-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              maxLength={200}
            />
          </label>
        )}
        <label className="admin-label">
          Email address
          <input
            className="admin-field"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {(mode === 'password' || mode === 'signup') && (
          <label className="admin-label">
            Password
            <input
              className="admin-field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              minLength={mode === 'signup' ? 12 : undefined}
              required
            />
          </label>
        )}
        {mode === 'signup' && (
          <p className="admin-help">
            Use at least 12 characters. You will receive an email to verify your
            account.
          </p>
        )}
        {mode === 'forgot' && (
          <p className="text-sm text-ink/60">
            Enter your account email to receive a password-reset link.
          </p>
        )}
        <button disabled={busy} className="admin-primary-button w-full">
          {busy
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'link'
                ? 'Send sign-in link'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : 'Sign in'}
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={() => changeMode('forgot')}
        className="admin-quiet-action"
      >
        Forgot your password?
      </button>
      <p className="text-center text-sm text-ink/60">
        <a href="/menu" className="underline">
          Continue shopping as a guest
        </a>
      </p>
    </div>
  );
}
