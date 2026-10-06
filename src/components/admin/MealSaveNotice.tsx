'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MealSaveNotice({ kind }: { kind: 'updated' | 'created' }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      router.replace('/admin/meals', { scroll: false });
    }, 6000);
    return () => clearTimeout(timer);
  }, [router]);

  if (!visible) return null;
  return (
    <div role="status" className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-4 rounded-panel border border-moss-600/20 bg-white p-4 text-moss-700 shadow-soft">
      <p className="text-sm font-bold">{kind === 'updated' ? 'Meal changes saved successfully.' : 'Meal added successfully.'}</p>
      <button type="button" aria-label="Dismiss notification" className="min-h-10 min-w-10 rounded-control text-xl" onClick={() => {
        setVisible(false);
        router.replace('/admin/meals', { scroll: false });
      }}>×</button>
    </div>
  );
}
