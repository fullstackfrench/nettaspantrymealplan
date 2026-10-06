'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveMealWithFeedback } from '@/app/admin/actions';

export default function MealSaveForm({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    // Capture every field before disabling the editor during the request.
    const formData = new FormData(event.currentTarget);
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await saveMealWithFeedback({ error: null, saved: false }, formData);
      if (!result.saved) {
        setError(result.error ?? 'Unable to save this meal. Please try again.');
        requestAnimationFrame(() => {
          errorRef.current?.focus();
          errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        return;
      }
      router.replace(`/admin/meals?saved=${formData.get('id') ? 'updated' : 'created'}`);
      router.refresh();
    } catch {
      setError('Unable to reach the server. Your edits are still here; please try saving again.');
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} onInvalidCapture={(event) => {
      const field = event.target as HTMLInputElement;
      const label = field.labels?.[0]?.textContent?.trim() || field.name || 'This field';
      setError(`${label}: ${field.validationMessage}`);
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }} encType="multipart/form-data" aria-busy={saving} className="mt-6 space-y-5">
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-control bg-clay-100 p-3 text-sm text-brand-brick">{error}</p>}
      {saving && <p role="status" className="text-sm text-ink/70">Saving meal…</p>}
      <fieldset disabled={saving} className="min-w-0 space-y-5">{children}</fieldset>
    </form>
  );
}
