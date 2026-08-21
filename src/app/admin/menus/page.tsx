import { createAdminClient } from '@/lib/supabase/server';
import { createWeeklyMenu, setMenuItem, toggleMenuPublished } from '../actions';
import type { Meal, WeeklyMenu } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Monday of the current week, as YYYY-MM-DD. */
function nextMonday() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + ((8 - day) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

export default async function MenusAdmin({
  searchParams,
}: {
  searchParams: { menu?: string };
}) {
  const supabase = createAdminClient();

  const [{ data: menusData }, { data: mealsData }] = await Promise.all([
    supabase.from('weekly_menus').select('*').order('week_start', { ascending: false }),
    supabase.from('meals').select('*').eq('is_active', true).order('name'),
  ]);

  const menus = (menusData ?? []) as WeeklyMenu[];
  const meals = (mealsData ?? []) as Meal[];
  const selected = menus.find((m) => m.id === searchParams.menu) ?? menus[0] ?? null;

  const { data: itemsData } = selected
    ? await supabase.from('weekly_menu_items').select('meal_id').eq('menu_id', selected.id)
    : { data: [] as { meal_id: string }[] };

  const included = new Set((itemsData ?? []).map((i) => i.meal_id));

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Menu calendar</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Weeks</h2>

        <form action={createWeeklyMenu} className="admin-card mt-4 p-4">
          <label htmlFor="week-start" className="admin-label">Start a new menu week</label>
          <div className="mt-2 flex flex-col gap-2 min-[380px]:flex-row">
          <input
            id="week-start"
            type="date"
            name="week_start"
            defaultValue={nextMonday()}
            className="admin-field mt-0 min-w-0 flex-1"
          />
          <button className="admin-primary-button shrink-0">
            Add
          </button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {menus.map((m) => (
            <a
              key={m.id}
              href={`/admin/menus?menu=${m.id}`}
              className={[
                'block rounded-control bg-white p-4 text-sm transition',
                selected?.id === m.id ? 'ring-2 ring-brand-plum shadow-soft' : 'ring-1 ring-brand-plum/10 hover:ring-brand-plum/30',
              ].join(' ')}
            >
              <div className="font-bold text-brand-plum">Week of {m.week_start}</div>
              <span className={`status-badge mt-2 ${m.is_published ? 'bg-moss-50 text-moss-700' : 'bg-brand-gold/15 text-[#6e5925]'}`}>{m.is_published ? 'Published' : 'Draft'}</span>
            </a>
          ))}
          {menus.length === 0 && (
            <p className="admin-empty-state">
              No weeks yet. Add one to start planning.
            </p>
          )}
        </div>
      </div>

      <div>
        {!selected ? (
          <p className="admin-empty-state">Create a week to begin planning the menu.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-bold text-brand-plum">
                Week of {selected.week_start}
              </h2>
              <form action={toggleMenuPublished}>
                <input type="hidden" name="id" value={selected.id} />
                <input type="hidden" name="next" value={String(!selected.is_published)} />
                <button
                  className={[
                    'min-h-11 rounded-full px-5 py-2.5 text-sm font-bold transition',
                    selected.is_published
                      ? 'bg-white text-brand-plum ring-1 ring-brand-plum/20 hover:bg-brand-plum/5'
                      : 'bg-brand-plum text-white shadow-soft hover:bg-[#542043]',
                  ].join(' ')}
                >
                  {selected.is_published ? 'Unpublish' : 'Publish this week'}
                </button>
              </form>
            </div>

            <p className="mt-2 text-sm text-ink/55">
              Tick the meals you&apos;re cooking this week. {included.size} selected.
            </p>

            <div className="admin-card mt-5 divide-y divide-brand-plum/10 overflow-hidden">
              {meals.map((meal) => {
                const isIn = included.has(meal.id);
                return (
                  <form
                    key={meal.id}
                    action={setMenuItem}
                    className="flex flex-col gap-3 p-4 min-[420px]:flex-row min-[420px]:items-center"
                  >
                    <input type="hidden" name="menu_id" value={selected.id} />
                    <input type="hidden" name="meal_id" value={meal.id} />
                    <input type="hidden" name="include" value={String(!isIn)} />

                    <div className="flex-1">
                      <div className="font-bold text-brand-plum">{meal.name}</div>
                      <div className="mt-1 text-sm text-ink/55">{meal.subtitle}</div>
                    </div>

                    <button
                      className={[
                        'min-h-11 w-full rounded-full px-4 py-2 text-sm font-bold transition min-[420px]:w-auto',
                        isIn ? 'bg-moss-600 text-white' : 'text-brand-plum ring-1 ring-brand-plum/20 hover:bg-brand-plum/5',
                      ].join(' ')}
                    >
                      {isIn ? 'On the menu' : 'Add'}
                    </button>
                  </form>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
