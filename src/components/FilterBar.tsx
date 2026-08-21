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
    <div className="rounded-2xl bg-black/[0.04] p-2">
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {visible.map((f) => {
          const isActive = active === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              aria-pressed={isActive}
              className={[
                'flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition',
                isActive
                  ? 'bg-white shadow-sm ring-1 ring-black'
                  : 'text-black/60 hover:bg-white/60 hover:text-black',
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
