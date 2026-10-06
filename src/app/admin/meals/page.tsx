import { createAdminClient } from '@/lib/supabase/server';
import { formatCents, FILTERS } from '@/lib/constants';
import { deleteMeal, toggleMealActive } from '../actions';
import MealSaveForm from '@/components/admin/MealSaveForm';
import MealSaveNotice from '@/components/admin/MealSaveNotice';
import MealSizesEditor from '@/components/admin/MealSizesEditor';
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
    .select('*')
    .order('created_at', { ascending: false });

  const meals = (data ?? []) as Meal[];
  const editing = meals.find((m) => m.id === searchParams.edit) ?? null;

  let editingSizes: MealSize[] = [];
  if (editing) {
    const { data: sizeRows } = await supabase
      .from('meal_sizes')
      .select('*')
      .eq('meal_id', editing.id)
      .order('sort_order');
    editingSizes = (sizeRows ?? []) as MealSize[];
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
      {(searchParams.saved === 'updated' || searchParams.saved === 'created') && (
        <MealSaveNotice key={searchParams.saved} kind={searchParams.saved} />
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Kitchen catalog</p>
        <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">Meal library</h2>
        <p className="mt-2 text-sm leading-6 text-ink/55">
          {meals.length} meal{meals.length === 1 ? '' : 's'}. Inactive meals stay in your
          library but disappear from the customer menu.
        </p>

        <div className="admin-card mt-5 divide-y divide-brand-plum/10 overflow-hidden">
          {meals.length === 0 && (
            <p className="p-8 text-center text-sm text-ink/55">
              No meals yet. Add your first one using the form.
            </p>
          )}

          {meals.map((m) => (
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
          ))}
        </div>
      </div>

      <MealForm key={editing?.id ?? 'new'} meal={editing} sizes={editingSizes} />
    </div>
  );
}

function MealForm({ meal, sizes }: { meal: Meal | null; sizes: MealSize[] }) {
  const tagOptions = FILTERS.filter((f) => f.id !== 'all').map((f) => f.id);

  return (
    <aside className="admin-card h-fit p-5 sm:p-6 xl:sticky xl:top-24">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-gold">Meal details</p>
      <h2 className="mt-1 font-display text-2xl font-bold text-brand-plum">
        {meal ? 'Edit meal' : 'Add a meal'}
      </h2>
      {meal && (
        <a href="/admin/meals" className="admin-quiet-action mt-2 -ml-3">
          Cancel and add a new one instead
        </a>
      )}

      <MealSaveForm key={meal?.id ?? 'new'}>
        {meal && <input type="hidden" name="id" value={meal.id} />}

        <Input name="name" label="Meal name" defaultValue={meal?.name} required />
        <Input
          name="subtitle"
          label="Subtitle"
          hint="The smaller line, e.g. “with Stone-Ground Grits”"
          defaultValue={meal?.subtitle ?? ''}
        />
        <Textarea name="description" label="Description" defaultValue={meal?.description ?? ''} />

        <div>
          <label htmlFor="meal-photo" className="admin-label">Photo</label>
          {meal?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meal.image_url}
              alt=""
              className="mt-3 h-28 w-28 rounded-control object-cover ring-1 ring-brand-plum/10"
            />
          )}
          <input
            id="meal-photo"
            type="file"
            name="photo"
            accept="image/*"
            className="mt-3 block w-full rounded-control border border-dashed border-brand-plum/25 bg-cream/60 p-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-plum file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
          />
          <p className="admin-help">
            Upload a new photo to replace the current one, or leave blank to keep it.
          </p>
        </div>
        <Input
          name="image_url"
          label="Photo URL"
          hint="Only used if you don't upload a photo above — paste a link instead"
          defaultValue={meal?.image_url ?? ''}
        />
        <Input
          name="price"
          label="Price (dollars)"
          type="number"
          step="0.01"
          defaultValue={meal ? (meal.price_cents / 100).toFixed(2) : '13.95'}
        />

        <fieldset>
          <legend className="admin-label">Nutrition</legend>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input name="calories" label="Cal" type="number" defaultValue={meal?.calories ?? ''} />
          <Input name="protein_g" label="Protein" type="number" defaultValue={meal?.protein_g ?? ''} />
          <Input name="carbs_g" label="Carbs" type="number" defaultValue={meal?.carbs_g ?? ''} />
          <Input name="fat_g" label="Fat" type="number" defaultValue={meal?.fat_g ?? ''} />
          </div>
        </fieldset>

        <MealSizesEditor
          sizes={sizes}
          mealOneTimeEligible={meal?.is_available_for_one_time ?? true}
          mealSubscriptionEligible={meal?.is_available_for_subscription ?? true}
        />

        <Textarea
          name="ingredients"
          label="Ingredients"
          hint="Comma separated"
          defaultValue={meal?.ingredients.join(', ') ?? ''}
        />
        <Input
          name="allergen_free"
          label="Allergen badges"
          hint="Comma separated, e.g. Gluten Free, Dairy Free"
          defaultValue={meal?.allergen_free.join(', ') ?? ''}
        />
        <Input
          name="tags"
          label="Filter tags"
          hint={`Comma separated. Valid: ${tagOptions.join(', ')}`}
          defaultValue={meal?.tags.join(', ') ?? ''}
        />
        <Input name="slug" label="URL slug" hint="Leave blank to generate from the name" defaultValue={meal?.slug ?? ''} />

        <label className="flex min-h-11 items-center gap-3 rounded-control bg-cream px-3 text-sm font-medium text-ink/75">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={meal ? meal.is_active : true}
            className="h-4 w-4"
          />
          Show on the customer menu
        </label>

        <button className="admin-primary-button w-full">
          {meal ? 'Save changes' : 'Add meal'}
        </button>
      </MealSaveForm>
    </aside>
  );
}

function Input({
  name,
  label,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `meal-${name}`;
  return (
    <div>
      <label htmlFor={id} className="admin-label">{label}</label>
      <input
        id={id}
        name={name}
        {...rest}
        className="admin-field"
      />
      {hint && <p className="admin-help">{hint}</p>}
    </div>
  );
}

function Textarea({
  name,
  label,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `meal-${name}`;
  return (
    <div>
      <label htmlFor={id} className="admin-label">{label}</label>
      <textarea
        id={id}
        name={name}
        rows={3}
        {...rest}
        className="admin-field min-h-24 resize-y"
      />
      {hint && <p className="admin-help">{hint}</p>}
    </div>
  );
}
