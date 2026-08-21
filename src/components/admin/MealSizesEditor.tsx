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
    <div>
      <label className="text-sm font-medium">Sizes &amp; prices</label>
      <p className="mt-1 text-xs text-black/45">
        Optional. Add a size for each portion you offer (e.g. Regular, Family). Leave empty to
        use the single price above.
      </p>

      <div className="mt-2 space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2">
            <input
              name="size_label"
              placeholder="Label, e.g. Regular"
              value={row.label}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, label: e.target.value };
                setRows(next);
              }}
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
            />
            <input
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
              className="w-24 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="text-sm text-clay-500 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, { key: nextKey++, label: '', price: '' }])}
        className="mt-2 text-sm font-semibold text-moss-600 hover:underline"
      >
        + Add a size
      </button>
    </div>
  );
}
