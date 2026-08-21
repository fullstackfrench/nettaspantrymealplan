'use client';

import { useState } from 'react';
import type { MealSize } from '@/lib/types';

type SizeRow = {
  key: string;
  id: string;
  label: string;
  servings: string;
  price: string;
  isActive: boolean;
  oneTimeEligible: boolean;
  subscriptionEligible: boolean;
};

let nextKey = 0;

function newKey() {
  return `new-${nextKey++}`;
}

export default function MealSizesEditor({
  sizes,
  mealOneTimeEligible,
  mealSubscriptionEligible,
}: {
  sizes: MealSize[];
  mealOneTimeEligible: boolean;
  mealSubscriptionEligible: boolean;
}) {
  const [oneTimeEnabled, setOneTimeEnabled] = useState(mealOneTimeEligible);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(mealSubscriptionEligible);
  const [rows, setRows] = useState<SizeRow[]>(() =>
    sizes.map((size) => ({
      key: size.id,
      id: size.id,
      label: size.label,
      servings: size.servings == null ? '' : String(size.servings),
      price: (size.price_cents / 100).toFixed(2),
      isActive: size.is_active,
      oneTimeEligible: size.is_active && size.is_available_for_one_time,
      subscriptionEligible: size.is_active && size.is_available_for_subscription,
    }))
  );

  function updateRow(index: number, update: Partial<SizeRow>) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...update } : row))
    );
  }

  function selectSubscriptionSize(key: string) {
    setRows((current) =>
      current.map((row) => ({ ...row, subscriptionEligible: row.key === key }))
    );
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Purchase availability</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_available_for_one_time"
            checked={oneTimeEnabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setOneTimeEnabled(enabled);
              if (!enabled) {
                setRows((current) =>
                  current.map((row) => ({ ...row, oneTimeEligible: false }))
                );
              }
            }}
          />
          Available for one-time purchase
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_available_for_subscription"
            checked={subscriptionEnabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setSubscriptionEnabled(enabled);
              if (!enabled) {
                setRows((current) =>
                  current.map((row) => ({ ...row, subscriptionEligible: false }))
                );
              }
            }}
          />
          Available for subscription
        </label>
      </fieldset>

      <div>
        <label className="text-sm font-medium">Sizes &amp; prices</label>
        <p className="mt-1 text-xs text-black/45">
          Active sizes need a label, positive serving count, and price. Choose at most one
          active size as the standard subscription size; other sizes can remain one-time-only.
        </p>

        <div className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="rounded-xl border border-black/10 p-3">
              <input type="hidden" name="size_id" value={row.id} />
              <input type="hidden" name="size_row_key" value={row.key} />
              <input type="hidden" name="size_active" value={String(row.isActive)} />
              <input
                type="hidden"
                name="size_one_time_eligible"
                value={String(row.oneTimeEligible)}
              />

              <div className="grid gap-2 sm:grid-cols-[1fr_90px_100px]">
                <input
                  name="size_label"
                  placeholder="Label, e.g. Feeds 2"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  className="min-w-0 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
                />
                <input
                  name="size_servings"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Serves"
                  value={row.servings}
                  onChange={(event) => updateRow(index, { servings: event.target.value })}
                  className="rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
                />
                <input
                  name="size_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Price"
                  value={row.price}
                  onChange={(event) => updateRow(index, { price: event.target.value })}
                  className="rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={row.isActive}
                    onChange={(event) => {
                      const isActive = event.target.checked;
                      updateRow(index, {
                        isActive,
                        oneTimeEligible: isActive ? row.oneTimeEligible : false,
                        subscriptionEligible: isActive ? row.subscriptionEligible : false,
                      });
                    }}
                  />
                  Active
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={row.oneTimeEligible}
                    disabled={!row.isActive || !oneTimeEnabled}
                    onChange={(event) =>
                      updateRow(index, { oneTimeEligible: event.target.checked })
                    }
                  />
                  One-time purchase
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="subscription_size_key"
                    value={row.key}
                    checked={row.subscriptionEligible}
                    disabled={!row.isActive || !subscriptionEnabled}
                    onChange={() => selectSubscriptionSize(row.key)}
                  />
                  Standard subscription size
                </label>
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                  className="ml-auto text-clay-500 hover:underline"
                >
                  {row.id ? 'Deactivate on save' : 'Remove'}
                </button>
              </div>

              {!row.isActive && row.id && (
                <p className="mt-2 text-xs text-black/45">
                  Inactive. Keep this row to reactivate it without changing its ID.
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: newKey(),
                id: '',
                label: '',
                servings: '',
                price: '',
                isActive: true,
                oneTimeEligible: oneTimeEnabled,
                subscriptionEligible: false,
              },
            ])
          }
          className="mt-3 text-sm font-semibold text-moss-600 hover:underline"
        >
          + Add a size
        </button>
      </div>
    </div>
  );
}
