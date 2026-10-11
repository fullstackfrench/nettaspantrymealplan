'use client';

import { Children, useState } from 'react';
import { ADMIN_MEAL_CATEGORIES, getAdminMealCategory, matchesAdminMealSearch } from '@/lib/admin-meal-categories';
import type { Meal } from '@/lib/types';

type SearchableMeal = Pick<Meal, 'id' | 'name' | 'subtitle' | 'description' | 'ingredients' | 'tags' | 'is_active'>;

export default function MealLibraryBrowser({ meals, children }: { meals: SearchableMeal[]; children: React.ReactNode }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [visibility, setVisibility] = useState('all');
  const rows = Children.toArray(children);
  const matching = meals.map((meal, index) => ({ meal, index })).filter(({ meal }) =>
    matchesAdminMealSearch(meal, query) &&
    (category === 'all' || getAdminMealCategory(meal) === category) &&
    (visibility === 'all' || meal.is_active === (visibility === 'visible'))
  );
  const reset = () => { setQuery(''); setCategory('all'); setVisibility('all'); };

  return (
    <div className="mt-5">
      <div className="admin-card space-y-3 p-4">
        <label htmlFor="library-search" className="admin-label">Search meals</label>
        <input id="library-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, description, ingredients, or tags…" className="admin-field mt-0" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-brand-plum">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="admin-field">
              <option value="all">All categories</option>
              {ADMIN_MEAL_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label} ({meals.filter((meal) => getAdminMealCategory(meal) === item.id).length})</option>)}
              <option value="uncategorized">Uncategorized ({meals.filter((meal) => getAdminMealCategory(meal) === 'uncategorized').length})</option>
            </select>
          </label>
          <label className="text-sm font-medium text-brand-plum">Visibility
            <select value={visibility} onChange={(event) => setVisibility(event.target.value)} className="admin-field">
              <option value="all">Visible &amp; hidden</option><option value="visible">Visible only</option><option value="hidden">Hidden only</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p role="status" className="text-sm text-ink/55">Showing {matching.length} of {meals.length} meals</p>
          <button type="button" onClick={reset} className="admin-quiet-action">Clear filters</button>
        </div>
      </div>
      <div className="admin-card mt-4 divide-y divide-brand-plum/10 overflow-hidden">
        {matching.length === 0 ? <p className="p-8 text-center text-sm text-ink/55">{meals.length === 0 ? 'No meals yet. Add your first one using the form.' : 'No meals match your search. Try another term or clear the filters.'}</p> : matching.map(({ index }) => rows[index])}
      </div>
    </div>
  );
}
