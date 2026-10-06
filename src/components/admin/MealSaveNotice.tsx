'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MealSaveNotice({ kind }: { kind: 'updated' | 'created' }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  function dismiss() {
    setVisible(false);
    router.replace('/admin/meals', { scroll: false });
  }

  if (!visible) return null;
  return (
    <dialog ref={dialogRef} aria-labelledby="meal-save-title" aria-describedby="meal-save-message" onCancel={(event) => {
      event.preventDefault();
      dismiss();
    }} className="w-[calc(100%_-_2rem)] max-w-sm rounded-panel border border-moss-600/20 bg-white p-6 text-center shadow-soft backdrop:bg-black/40">
      <div aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss-50 text-2xl text-moss-700">✓</div>
      <h2 id="meal-save-title" className="mt-4 font-display text-2xl font-bold text-brand-plum">{kind === 'updated' ? 'Changes saved' : 'Meal added'}</h2>
      <p id="meal-save-message" role="status" className="mt-2 text-sm text-ink/70">{kind === 'updated' ? 'Meal changes saved successfully.' : 'Meal added successfully.'}</p>
      <button type="button" autoFocus className="admin-primary-button mt-5 w-full" onClick={dismiss}>OK</button>
    </dialog>
  );
}
