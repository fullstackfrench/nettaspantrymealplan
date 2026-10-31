'use client';

import { useState } from 'react';
import { setMenuItem } from '@/app/admin/actions';
import type { Meal } from '@/lib/types';
import Dialog from '@/components/ui/Dialog';
import MealEditorForm from './MealEditorForm';

export default function WeeklyMenuMeals({ menuId, meals, includedIds }: {
  menuId: string;
  meals: Meal[];
  includedIds: string[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const included = new Set(includedIds);
  const editing = meals.find((meal) => meal.id === editingId);

  return (
    <>
      <p role="status" className="mt-3 text-sm font-medium text-moss-700">{notice}</p>
      <div className="admin-card mt-5 divide-y divide-brand-plum/10 overflow-hidden">
        {meals.filter((meal) => meal.is_active || included.has(meal.id)).map((meal) => {
          const isIn = included.has(meal.id);
          return (
            <div key={meal.id} className="flex flex-col gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center">
              <button type="button" aria-haspopup="dialog" aria-label={`Edit ${meal.name}`}
                onClick={() => { setNotice(null); setEditingId(meal.id); }}
                className="min-h-11 min-w-0 flex-1 rounded-control p-1 text-left transition hover:bg-brand-plum/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-plum">
                <span className="block font-bold text-brand-plum">{meal.name}</span>
                {meal.subtitle && <span className="mt-1 block text-sm text-ink/55">{meal.subtitle}</span>}
                <span className="mt-1 block text-xs font-medium text-brand-plum/70">Edit meal details</span>
                {!meal.is_active && <span className="status-badge mt-2 bg-clay-100 text-brand-brick">Hidden from customers</span>}
              </button>
              <form action={setMenuItem}>
                <input type="hidden" name="menu_id" value={menuId} />
                <input type="hidden" name="meal_id" value={meal.id} />
                <input type="hidden" name="include" value={String(!isIn)} />
                <button className={`min-h-11 w-full rounded-full px-4 py-2 text-sm font-bold transition min-[420px]:w-auto ${isIn ? 'bg-moss-600 text-white' : 'text-brand-plum ring-1 ring-brand-plum/20 hover:bg-brand-plum/5'}`}>
                  {isIn ? 'On the menu' : 'Add'}
                </button>
              </form>
            </div>
          );
        })}
      </div>
      {editing && (
        <Dialog titleId="weekly-meal-editor-title" onClose={() => { if (!saving) setEditingId(null); }}>
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-brand-plum/10 bg-white px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Meal details</p>
              <h2 id="weekly-meal-editor-title" className="mt-1 font-display text-xl font-bold text-brand-plum">Edit {editing.name}</h2>
              <p className="mt-1 text-sm text-ink/60">Changes update this meal in your library and any menus using it.</p>
            </div>
            <button type="button" disabled={saving} onClick={() => setEditingId(null)} aria-label="Close meal editor"
              className="admin-quiet-action shrink-0 disabled:opacity-50">Close</button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 sm:px-6">
            <MealEditorForm key={editing.id} meal={editing}
              sizes={[...(editing.meal_sizes ?? [])].sort((a, b) => a.sort_order - b.sort_order)}
              onSavingChange={setSaving}
              onSaved={() => { setNotice('Meal changes saved.'); setEditingId(null); }} />
          </div>
        </Dialog>
      )}
    </>
  );
}
