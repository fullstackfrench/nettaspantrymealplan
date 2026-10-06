'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { saveMealWithFeedback } from '@/app/admin/actions';

export default function MealSaveForm({ children }: { children: React.ReactNode }) {
  const [state, action] = useFormState(saveMealWithFeedback, { error: null, saved: false });
  return (
    <form action={action} encType="multipart/form-data" className="mt-6 space-y-5">
      {state.error && <p role="alert" className="rounded-control bg-clay-100 p-3 text-sm text-brand-brick">{state.error}</p>}
      {state.saved && <p role="status" className="text-sm text-moss-700">Meal saved.</p>}
      <Fields>{children}</Fields>
    </form>
  );
}

function Fields({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="min-w-0 space-y-5">{children}</fieldset>;
}
