'use client';

import { FILTERS } from '@/lib/constants';
import { ADMIN_MEAL_CATEGORIES, getAdminMealCategory, isAdminMealCategoryTag } from '@/lib/admin-meal-categories';
import type { Meal, MealSize } from '@/lib/types';
import MealSaveForm from './MealSaveForm';
import MealSizesEditor from './MealSizesEditor';

export default function MealEditorForm({ meal, sizes, onSaved, onSavingChange }: {
  meal: Meal | null;
  sizes: MealSize[];
  onSaved?: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const tagOptions = FILTERS.filter((f) => f.id !== 'all').map((f) => f.id);
  return (
      <MealSaveForm key={meal?.id ?? 'new'} onSaved={onSaved} onSavingChange={onSavingChange}>
        {meal && <input type="hidden" name="id" value={meal.id} />}

        <Input name="name" label="Meal name" defaultValue={meal?.name} required />
        <label className="admin-label">Category
          <select name="category" defaultValue={meal ? getAdminMealCategory(meal) : 'uncategorized'} className="admin-field">
            <option value="uncategorized">Uncategorized</option>
            {ADMIN_MEAL_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
        <p className="admin-help">Existing meals without an assigned category are grouped by name. Choose a category and save to confirm or change it. For subscriptions, Sides fill the side slots; Main Dishes, Breakfast & Brunch, Salads & Bowls, and Soups & Stews fill the entrée slots.</p>
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
          defaultValue={meal?.tags.filter((tag) => !isAdminMealCategoryTag(tag)).join(', ') ?? ''}
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
