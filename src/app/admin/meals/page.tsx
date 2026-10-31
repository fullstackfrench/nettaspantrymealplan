import { createAdminClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/constants';
import { deleteMeal, toggleMealActive } from '../actions';
import MealEditorForm from '@/components/admin/MealEditorForm';
import MealSaveNotice from '@/components/admin/MealSaveNotice';
import MealLibraryBrowser from '@/components/admin/MealLibraryBrowser';
import { getSubscriptionKind } from '@/lib/subscription-mix';
import type { Meal, MealSize } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MealsAdmin({
  searchParams,
}: {
  searchParams: { edit?: string; saved?: string };
}) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('meals')
    .select('*, meal_sizes(*)')
    .order('created_at', { ascending: false });

  const meals = (data ?? []) as Meal[];
  const editing = meals.find((m) => m.id === searchParams.edit) ?? null;

  const editingSizes = [...(editing?.meal_sizes ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
      {(searchParams.saved === 'updated' || searchParams.saved === 'created') && (
        <MealSaveNotice key={searchParams.saved} kind={searchParams.saved} />
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Kitchen catalog</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Meal library</h2>
        <div className="mt-2 text-sm leading-6 text-ink/55">
          <p>To appear on &ldquo;This Week&apos;s Menu,&rdquo; a meal must be active and ready for the customer&apos;s selected order type:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>One-time box:</strong> Enable one-time purchase for the meal and at least one active size. That size needs a serving count greater than zero and a price greater than $0.</li>
            <li><strong>Weekly subscription:</strong> Enable subscription availability for the meal and select exactly one active standard subscription size with a serving count greater than zero.</li>
          </ul>
          <p className="mt-2">Enter servings as whole numbers. Meals that don&apos;t meet these requirements stay in your library but are hidden from the menu for that order type.</p>
        </div>

        <MealLibraryBrowser meals={meals.map(({ id, name, subtitle, description, ingredients, tags, is_active }) => ({ id, name, subtitle, description, ingredients, tags, is_active }))}>
          {meals.map((m) => {
            const oneTime = getOneTimeReadiness(m);
            const subscription = getSubscriptionReadiness(m);
            return (
            <div key={m.id} className="grid gap-4 p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-control bg-cream">
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">🍲</div>
                )}
              </div>

              <div className="min-w-0">
                <div className="truncate font-bold text-brand-plum">{m.name}</div>
                <div className="mt-1 truncate text-sm text-ink/55">
                  {formatCents(m.price_cents)}
                  {m.tags.length > 0 && ` · ${m.tags.join(', ')}`}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ReadinessBadge label="One-time" readiness={oneTime} />
                  <ReadinessBadge label="Subscription" readiness={subscription} />
                </div>
              </div>

              <div className="col-span-full flex flex-wrap items-center gap-1 sm:col-span-1 sm:justify-end">
              <span className={`status-badge ${m.is_active ? 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15' : 'bg-black/5 text-ink/60'}`}>{m.is_active ? 'Visible' : 'Hidden'}</span>
              <a href={`/admin/meals?edit=${m.id}`} className="admin-quiet-action">Edit</a>

              <form action={toggleMealActive}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="next" value={String(!m.is_active)} />
                <button className="admin-quiet-action text-ink/60">
                  {m.is_active ? 'Hide' : 'Show'}
                </button>
              </form>

              <form action={deleteMeal}>
                <input type="hidden" name="id" value={m.id} />
                <button className="admin-danger-action">Delete</button>
              </form>
              </div>
            </div>
            );
          })}
        </MealLibraryBrowser>
      </div>

      <MealForm key={editing?.id ?? 'new'} meal={editing} sizes={editingSizes} />
    </div>
  );
}

type Readiness = { ready: true } | { ready: false; reason: string };

function getOneTimeReadiness(meal: Meal): Readiness {
  if (!meal.is_active) return { ready: false, reason: 'Activate meal' };
  if (!meal.is_available_for_one_time) {
    return { ready: false, reason: 'Enable one-time ordering' };
  }

  const sizes = meal.meal_sizes ?? [];
  const activeSizes = sizes.filter((size) => size.is_active);
  if (activeSizes.length === 0) return { ready: false, reason: 'Add an active size' };

  const eligibleSizes = activeSizes.filter((size) => size.is_available_for_one_time);
  if (eligibleSizes.length === 0) {
    return { ready: false, reason: 'Enable one-time on a size' };
  }
  if (!eligibleSizes.some((size) => size.servings != null && size.servings > 0)) {
    return { ready: false, reason: 'Add servings' };
  }
  if (!eligibleSizes.some((size) =>
    size.servings != null && size.servings > 0 && size.price_cents > 0
  )) {
    return { ready: false, reason: 'Add a valid price' };
  }
  return { ready: true };
}

function getSubscriptionReadiness(meal: Meal): Readiness {
  if (!meal.is_active) return { ready: false, reason: 'Activate meal' };
  if (!getSubscriptionKind(meal)) return { ready: false, reason: 'Choose a side or entrée category' };
  if (!meal.is_available_for_subscription) {
    return { ready: false, reason: 'Enable subscription ordering' };
  }

  const subscriptionSizes = (meal.meal_sizes ?? []).filter(
    (size) => size.is_active && size.is_available_for_subscription
  );
  if (subscriptionSizes.length === 0) {
    return { ready: false, reason: 'Choose subscription size' };
  }
  if (subscriptionSizes.length > 1) {
    return { ready: false, reason: 'Choose only one subscription size' };
  }
  if (subscriptionSizes[0].servings == null || subscriptionSizes[0].servings <= 0) {
    return { ready: false, reason: 'Add servings' };
  }
  return { ready: true };
}

function ReadinessBadge({ label, readiness }: { label: string; readiness: Readiness }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`status-badge ${readiness.ready
        ? 'bg-moss-50 text-moss-700 ring-1 ring-moss-600/15'
        : 'bg-clay-100 text-brand-brick ring-1 ring-brand-brick/15'
      }`}>
        {label} {readiness.ready ? 'ready' : 'setup needed'}
      </span>
      {!readiness.ready && (
        <span className="px-2 text-[0.68rem] font-medium text-ink/55">{readiness.reason}</span>
      )}
    </span>
  );
}

function MealForm({ meal, sizes }: { meal: Meal | null; sizes: MealSize[] }) {
  return (
    <aside className="admin-card h-fit p-5 sm:p-6 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Meal details</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">
        {meal ? 'Edit meal' : 'Add a meal'}
      </h2>
      {meal && (
        <a href="/admin/meals" className="admin-quiet-action mt-2 -ml-3">
          Cancel and add a new one instead
        </a>
      )}

      <MealEditorForm meal={meal} sizes={sizes} />
    </aside>
  );
}
