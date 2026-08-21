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
    <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
      <div>
        <h2 className="font-display text-xl font-bold">Weeks</h2>

        <form action={createWeeklyMenu} className="mt-4 flex gap-2">
          <input
            type="date"
            name="week_start"
            defaultValue={nextMonday()}
            className="flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-black/15"
          />
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {menus.map((m) => (
            <a
              key={m.id}
              href={`/admin/menus?menu=${m.id}`}
              className={[
                'block rounded-xl p-3 text-sm',
                selected?.id === m.id ? 'bg-moss-50 ring-2 ring-moss-600' : 'ring-1 ring-black/10',
              ].join(' ')}
            >
              <div className="font-semibold">Week of {m.week_start}</div>
              <div className="text-xs text-black/50">
                {m.is_published ? 'Published' : 'Draft'}
              </div>
            </a>
          ))}
          {menus.length === 0 && (
            <p className="text-sm text-black/50">
              No weeks yet. Add one to start planning.
            </p>
          )}
        </div>
      </div>

      <div>
        {!selected ? (
          <p className="text-sm text-black/50">Create a week to begin.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold">
                Week of {selected.week_start}
              </h2>
              <form action={toggleMenuPublished}>
                <input type="hidden" name="id" value={selected.id} />
                <input type="hidden" name="next" value={String(!selected.is_published)} />
                <button
                  className={[
                    'rounded-full px-5 py-2.5 text-sm font-semibold',
                    selected.is_published
                      ? 'ring-1 ring-black/20 hover:bg-black/5'
                      : 'bg-moss-600 text-white hover:bg-moss-700',
                  ].join(' ')}
                >
                  {selected.is_published ? 'Unpublish' : 'Publish this week'}
                </button>
              </form>
            </div>

            <p className="mt-2 text-sm text-black/50">
              Tick the meals you&apos;re cooking this week. {included.size} selected.
            </p>

            <div className="mt-5 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/5">
              {meals.map((meal) => {
                const isIn = included.has(meal.id);
                return (
                  <form
                    key={meal.id}
                    action={setMenuItem}
                    className="flex items-center gap-4 p-4"
                  >
                    <input type="hidden" name="menu_id" value={selected.id} />
                    <input type="hidden" name="meal_id" value={meal.id} />
                    <input type="hidden" name="include" value={String(!isIn)} />

                    <div className="flex-1">
                      <div className="font-semibold">{meal.name}</div>
                      <div className="text-sm text-black/50">{meal.subtitle}</div>
                    </div>

                    <button
                      className={[
                        'rounded-full px-4 py-2 text-sm font-semibold',
                        isIn ? 'bg-moss-600 text-white' : 'ring-1 ring-black/20',
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
