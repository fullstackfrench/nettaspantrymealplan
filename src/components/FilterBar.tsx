'use client';

import { FILTERS } from '@/lib/constants';

interface Props {
  active: string;
  onChange: (id: string) => void;
  /** Tag -> number of meals, so we can hide chips that would return nothing. */
  counts: Record<string, number>;
}

export default function FilterBar({ active, onChange, counts }: Props) {
  const visible = FILTERS.filter((f) => f.id === 'all' || (counts[f.id] ?? 0) > 0);

  return (
    <div className="relative -mx-4 sm:mx-0">
      <div className="no-scrollbar flex snap-x items-center gap-2 overflow-x-auto px-4 pb-1 sm:px-0" aria-label="Filter meals">
        {visible.map((f) => {
          const isActive = active === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              aria-pressed={isActive}
              className={[
                'flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'bg-brand-plum text-white shadow-soft'
                  : 'bg-white text-ink/65 ring-1 ring-brand-plum/15 hover:text-brand-plum hover:ring-brand-plum/30',
              ].join(' ')}
            >
              <span aria-hidden className="text-base">{f.icon}</span>
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
