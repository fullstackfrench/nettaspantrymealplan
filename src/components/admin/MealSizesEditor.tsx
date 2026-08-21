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
      <fieldset className="rounded-panel border border-brand-plum/10 bg-cream/60 p-4">
        <legend className="px-1 text-sm font-bold text-brand-plum">Purchase availability</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 rounded-control bg-white px-3 text-sm font-medium text-ink/75 ring-1 ring-brand-plum/10">
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
        <label className="flex min-h-11 items-center gap-3 rounded-control bg-white px-3 text-sm font-medium text-ink/75 ring-1 ring-brand-plum/10">
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
        </div>
      </fieldset>

      <fieldset className="rounded-panel border border-brand-plum/10 bg-cream/60 p-4">
        <legend className="px-1 text-sm font-bold text-brand-plum">Sizes &amp; prices</legend>
        <p className="admin-help mt-0">
          Active sizes need a label, positive serving count, and price. Choose at most one
          active size as the standard subscription size; other sizes can remain one-time-only.
        </p>

        <div className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <div key={row.key} className="rounded-control border border-brand-plum/10 bg-white p-3 shadow-sm">
              <input type="hidden" name="size_id" value={row.id} />
              <input type="hidden" name="size_row_key" value={row.key} />
              <input type="hidden" name="size_active" value={String(row.isActive)} />
              <input
                type="hidden"
                name="size_one_time_eligible"
                value={String(row.oneTimeEligible)}
              />

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_112px]">
                <label htmlFor={`size-label-${row.key}`} className="sr-only">Size {index + 1} label</label>
                <input
                  id={`size-label-${row.key}`}
                  name="size_label"
                  placeholder="Label, e.g. Feeds 2"
                  value={row.label}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  className="admin-field mt-0 min-w-0"
                />
                <label htmlFor={`size-servings-${row.key}`} className="sr-only">Size {index + 1} servings</label>
                <input
                  id={`size-servings-${row.key}`}
                  name="size_servings"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Serves"
                  value={row.servings}
                  onChange={(event) => updateRow(index, { servings: event.target.value })}
                  className="admin-field mt-0 w-full"
                />
                <label htmlFor={`size-price-${row.key}`} className="sr-only">Size {index + 1} price</label>
                <input
                  id={`size-price-${row.key}`}
                  name="size_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Price"
                  value={row.price}
                  onChange={(event) => updateRow(index, { price: event.target.value })}
                  className="admin-field mt-0 w-full"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink/70">
                <label className="flex min-h-10 items-center gap-2">
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
                <label className="flex min-h-10 items-center gap-2">
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
                <label className="flex min-h-10 items-center gap-2">
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
                  className="admin-danger-action ml-auto min-h-10"
                >
                  {row.id ? 'Deactivate on save' : 'Remove'}
                </button>
              </div>

              {!row.isActive && row.id && (
                <p className="admin-help mt-2">
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
          className="admin-secondary-button mt-4 w-full sm:w-auto"
        >
          + Add a size
        </button>
      </fieldset>
    </div>
  );
}
