'use client';

import { useState } from 'react';
import type { MealSize } from '@/lib/types';

let nextKey = 0;

export default function MealSizesEditor({ sizes }: { sizes: MealSize[] }) {
  const [rows, setRows] = useState(() =>
    sizes.length > 0
      ? sizes.map((s) => ({ key: nextKey++, label: s.label, price: (s.price_cents / 100).toFixed(2) }))
      : []
  );

  return (
    <fieldset className="rounded-panel border border-brand-plum/10 bg-cream/60 p-4">
      <legend className="px-1 text-sm font-bold text-brand-plum">Sizes &amp; prices</legend>
      <p className="admin-help mt-0">
        Optional. Add a size for each portion you offer (e.g. Regular, Family). Leave empty to
        use the single price above.
      </p>

      <div className="mt-4 space-y-3">
        {rows.map((row, i) => (
          <div key={row.key} className="grid gap-2 rounded-control border border-brand-plum/10 bg-white p-3 min-[420px]:grid-cols-[minmax(0,1fr)_112px_auto] min-[420px]:items-center">
            <label htmlFor={`size-label-${row.key}`} className="sr-only">Size {i + 1} label</label>
            <input
              id={`size-label-${row.key}`}
              name="size_label"
              placeholder="Label, e.g. Regular"
              value={row.label}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, label: e.target.value };
                setRows(next);
              }}
              className="admin-field mt-0 min-w-0"
            />
            <label htmlFor={`size-price-${row.key}`} className="sr-only">Size {i + 1} price</label>
            <input
              id={`size-price-${row.key}`}
              name="size_price"
              type="number"
              step="0.01"
              placeholder="Price"
              value={row.price}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, price: e.target.value };
                setRows(next);
              }}
              className="admin-field mt-0 w-full"
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="admin-danger-action justify-center min-[420px]:px-2"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, { key: nextKey++, label: '', price: '' }])}
        className="admin-secondary-button mt-4 w-full sm:w-auto"
      >
        + Add a size
      </button>
    </fieldset>
  );
}
