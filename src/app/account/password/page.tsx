'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
export default function PasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password !== confirmation) {
      setError('Passwords must match.');
      return;
    }
    setBusy(true);
    try {
      const client = createClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user)
        throw new Error(
          'Open the link in your password-reset email before setting a new password.',
        );
      const result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword('');
      setConfirmation('');
      setMessage('Your password has been updated.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Unable to update your password.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-3xl text-brand-plum">
        Set your password
      </h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="admin-label">
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="admin-field"
          />
        </label>
        <label className="admin-label">
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="admin-field"
          />
        </label>
        <p className="admin-help">Use at least 8 characters.</p>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="admin-primary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
      <Link className="admin-quiet-action mt-4" href="/account">
        Return to your account
      </Link>
    </div>
  );
}
