import { createAdminClient } from '@/lib/supabase/server';
import { formatCents, FILTERS } from '@/lib/constants';
import { deleteMeal, saveMeal, toggleMealActive } from '../actions';
import MealSizesEditor from '@/components/admin/MealSizesEditor';
import type { Meal, MealSize } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MealsAdmin({
  searchParams,
}: {
  searchParams: { edit?: string };
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
    <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
      <div>
        <h2 className="font-display text-xl font-bold">Meal library</h2>
        <p className="mt-1 text-sm text-black/50">
          {meals.length} meal{meals.length === 1 ? '' : 's'}. Inactive meals stay in your
          library but disappear from the customer menu.
        </p>

        <div className="mt-5 divide-y divide-black/10 rounded-2xl bg-white ring-1 ring-black/5">
          {meals.length === 0 && (
            <p className="p-6 text-sm text-black/50">
              No meals yet. Add your first one using the form.
            </p>
          )}

          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream">
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center">🍲</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.name}</div>
                <div className="truncate text-sm text-black/50">
                  {formatCents(m.price_cents)}
                  {m.tags.length > 0 && ` · ${m.tags.join(', ')}`}
                </div>
              </div>

              {!m.is_active && (
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold">
                  Hidden
                </span>
              )}

              <a
                href={`/admin/meals?edit=${m.id}`}
                className="text-sm font-semibold hover:underline"
              >
                Edit
              </a>

              <form action={toggleMealActive}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="next" value={String(!m.is_active)} />
                <button className="text-sm text-black/50 hover:text-black">
                  {m.is_active ? 'Hide' : 'Show'}
                </button>
              </form>

              <form action={deleteMeal}>
                <input type="hidden" name="id" value={m.id} />
                <button className="text-sm text-clay-500 hover:underline">Delete</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <MealForm meal={editing} sizes={editingSizes} />
    </div>
  );
}

function MealForm({ meal, sizes }: { meal: Meal | null; sizes: MealSize[] }) {
  const tagOptions = FILTERS.filter((f) => f.id !== 'all').map((f) => f.id);

  return (
    <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5 lg:sticky lg:top-6">
      <h2 className="font-display text-xl font-bold">
        {meal ? 'Edit meal' : 'Add a meal'}
      </h2>
      {meal && (
        <a href="/admin/meals" className="mt-1 inline-block text-sm underline">
          Cancel and add a new one instead
        </a>
      )}

      <form action={saveMeal} encType="multipart/form-data" className="mt-5 space-y-4">
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
          <label className="text-sm font-medium">Photo</label>
          {meal?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meal.image_url}
              alt=""
              className="mt-2 h-24 w-24 rounded-lg object-cover"
            />
          )}
          <input
            type="file"
            name="photo"
            accept="image/*"
            className="mt-2 block w-full text-sm"
          />
          <p className="mt-1 text-xs text-black/45">
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

        <div className="grid grid-cols-4 gap-2">
          <Input name="calories" label="Cal" type="number" defaultValue={meal?.calories ?? ''} />
          <Input name="protein_g" label="Protein" type="number" defaultValue={meal?.protein_g ?? ''} />
          <Input name="carbs_g" label="Carbs" type="number" defaultValue={meal?.carbs_g ?? ''} />
          <Input name="fat_g" label="Fat" type="number" defaultValue={meal?.fat_g ?? ''} />
        </div>

        <MealSizesEditor sizes={sizes} />

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

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={meal ? meal.is_active : true}
            className="h-4 w-4"
          />
          Show on the customer menu
        </label>

        <button className="w-full rounded-full bg-moss-600 px-6 py-3 text-sm font-semibold text-white hover:bg-moss-700">
          {meal ? 'Save changes' : 'Add meal'}
        </button>
      </form>
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
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        name={name}
        {...rest}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
      />
      {hint && <p className="mt-1 text-xs text-black/45">{hint}</p>}
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
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <textarea
        name={name}
        rows={3}
        {...rest}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-black/15 focus:outline-none focus:ring-2 focus:ring-moss-600"
      />
      {hint && <p className="mt-1 text-xs text-black/45">{hint}</p>}
    </div>
  );
}
