'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { DEPOSIT_PER_CONTAINER_CENTS } from '@/lib/constants';

const MEAL_PHOTOS_BUCKET = 'meal-photos';

/** Uploads via the service role, so the bucket needs no public write policy. */
async function uploadMealPhoto(
  supabase: ReturnType<typeof createAdminClient>,
  file: File
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(MEAL_PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from(MEAL_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Turn "Braised Short Rib Ragù" into "braised-short-rib-ragu". */
function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitList(raw: FormDataEntryValue | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toInt(raw: FormDataEntryValue | null): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SubmittedSize = {
  id: string | null;
  rowKey: string;
  label: string;
  servings: number | null;
  priceCents: number;
  isActive: boolean;
  oneTimeEligible: boolean;
  subscriptionEligible: boolean;
  sortOrder: number;
};

function parseBoolean(raw: string, field: string) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`Invalid ${field}.`);
}

function parsePriceCents(raw: string) {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Each size price must be a valid dollar amount with at most two decimals.');
  }
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('Each active size must have a positive one-time price.');
  }
  return cents;
}

function parseSubmittedSizes(
  formData: FormData,
  mealOneTimeEligible: boolean,
  mealSubscriptionEligible: boolean
): SubmittedSize[] {
  const ids = formData.getAll('size_id').map(String);
  const rowKeys = formData.getAll('size_row_key').map(String);
  const labels = formData.getAll('size_label').map(String);
  const servingsValues = formData.getAll('size_servings').map(String);
  const prices = formData.getAll('size_price').map(String);
  const activeValues = formData.getAll('size_active').map(String);
  const oneTimeValues = formData.getAll('size_one_time_eligible').map(String);
  const lengths = [rowKeys, labels, servingsValues, prices, activeValues, oneTimeValues].map(
    (values) => values.length
  );

  if (lengths.some((length) => length !== ids.length)) {
    throw new Error('Invalid meal-size submission.');
  }

  const selectedKeys = formData.getAll('subscription_size_key').map(String);
  if (selectedKeys.length > 1) {
    throw new Error('Only one standard subscription size may be selected.');
  }
  const selectedKey = selectedKeys[0] ?? null;
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();

  const rows = ids.map((rawId, index): SubmittedSize => {
    const id = rawId.trim() || null;
    const rowKey = rowKeys[index].trim();
    const label = labels[index].trim();
    const isActive = parseBoolean(activeValues[index], 'size status');
    const oneTimeEligible = parseBoolean(oneTimeValues[index], 'one-time eligibility');
    const subscriptionEligible = selectedKey === rowKey;
    const rawServings = servingsValues[index].trim();
    const servings = rawServings === '' ? null : Number(rawServings);

    if (!rowKey || seenKeys.has(rowKey)) throw new Error('Invalid or duplicate meal-size row.');
    seenKeys.add(rowKey);
    if (id) {
      if (!UUID_PATTERN.test(id) || seenIds.has(id)) {
        throw new Error('Invalid or duplicate meal-size ID.');
      }
      seenIds.add(id);
    }
    if (!label) throw new Error('Each size must have a label.');
    if (seenLabels.has(label)) throw new Error('Each size must have a unique label.');
    seenLabels.add(label);
    if (servings !== null && (!Number.isSafeInteger(servings) || servings <= 0)) {
      throw new Error('Servings must be a positive whole number.');
    }
    if (isActive && servings === null) {
      throw new Error('Each active size must have a positive whole-number serving count.');
    }
    if (!isActive && (oneTimeEligible || subscriptionEligible)) {
      throw new Error('Inactive sizes cannot be purchase-eligible.');
    }
    if (oneTimeEligible && !mealOneTimeEligible) {
      throw new Error('A size cannot be one-time eligible when the meal is not.');
    }
    if (subscriptionEligible && !mealSubscriptionEligible) {
      throw new Error('A subscription size requires meal-level subscription availability.');
    }

    return {
      id,
      rowKey,
      label,
      servings,
      priceCents: parsePriceCents(prices[index]),
      isActive,
      oneTimeEligible,
      subscriptionEligible,
      sortOrder: index,
    };
  });

  if (selectedKey && !seenKeys.has(selectedKey)) {
    throw new Error('The selected subscription size is invalid.');
  }

  return rows;
}

function throwIfError(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation} failed: ${error.message}`);
}

// ---------------- MEALS ----------------

export async function saveMealWithFeedback(
  _previous: { error: string | null; saved: boolean },
  formData: FormData
): Promise<{ error: string | null; saved: boolean }> {
  try {
    await saveMeal(formData);
    return { error: null, saved: true };
  } catch (error) {
    console.error('Meal save failed', error);
    return {
      error: error instanceof Error ? error.message : 'Unable to save this meal. Please try again.',
      saved: false,
    };
  }
}

export async function saveMeal(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get('id') as string | null;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Enter a meal name.');

  const mealOneTimeEligible = formData.get('is_available_for_one_time') === 'on';
  const mealSubscriptionEligible = formData.get('is_available_for_subscription') === 'on';
  const submittedSizes = parseSubmittedSizes(
    formData,
    mealOneTimeEligible,
    mealSubscriptionEligible
  );

  if (id && !UUID_PATTERN.test(id)) throw new Error('Invalid meal ID.');

  let existingSizes: { id: string; label: string }[] = [];
  if (id) {
    const { data: meal, error: mealLookupError } = await supabase
      .from('meals')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    throwIfError(mealLookupError, 'Meal lookup');
    if (!meal) throw new Error('Meal not found.');

    const { data, error } = await supabase.from('meal_sizes').select('id, label').eq('meal_id', id);
    throwIfError(error, 'Meal-size lookup');
    existingSizes = data ?? [];
    const existingIds = new Set(existingSizes.map((size) => size.id));
    if (submittedSizes.some((size) => size.id && !existingIds.has(size.id))) {
      throw new Error('A submitted meal size does not belong to this meal.');
    }
    // Removed rows remain in the database for order history. Reuse their IDs
    // when a replacement has the same label, which is unique even when inactive.
    const retainedIds = new Set(submittedSizes.map((size) => size.id).filter(Boolean));
    for (const size of submittedSizes) {
      const previous = existingSizes.find((existing) => existing.label === size.label);
      if (!previous || retainedIds.has(previous.id)) continue;
      if (size.id) {
        throw new Error(`The size label "${size.label}" belongs to a removed size. Restore that size or choose a different label.`);
      }
      size.id = previous.id;
      retainedIds.add(previous.id);
    }
  } else if (submittedSizes.some((size) => size.id)) {
    throw new Error('New meals cannot reference existing size IDs.');
  }

  const dollars = String(formData.get('price') ?? '0');

  const photo = formData.get('photo') as File | null;
  const uploadedUrl = photo && photo.size > 0 ? await uploadMealPhoto(supabase, photo) : null;

  const row = {
    name,
    slug: (formData.get('slug') as string)?.trim() || slugify(name),
    subtitle: (formData.get('subtitle') as string) || null,
    description: (formData.get('description') as string) || null,
    chef_name: (formData.get('chef_name') as string) || 'Chef Netta',
    image_url: uploadedUrl || (formData.get('image_url') as string) || null,
    price_cents: Math.round(parseFloat(dollars || '0') * 100),
    calories: toInt(formData.get('calories')),
    protein_g: toInt(formData.get('protein_g')),
    carbs_g: toInt(formData.get('carbs_g')),
    fat_g: toInt(formData.get('fat_g')),
    ingredients: splitList(formData.get('ingredients')),
    allergen_free: splitList(formData.get('allergen_free')),
    tags: splitList(formData.get('tags')),
    is_active: formData.get('is_active') === 'on',
    is_available_for_one_time: mealOneTimeEligible,
    is_available_for_subscription: mealSubscriptionEligible,
    updated_at: new Date().toISOString(),
  };

  let mealId = id;
  if (id) {
    const { error } = await supabase.from('meals').update(row).eq('id', id);
    throwIfError(error, 'Meal update');
  } else {
    const { data, error } = await supabase.from('meals').insert(row).select('id').single();
    throwIfError(error, 'Meal creation');
    mealId = data?.id ?? null;
  }

  if (mealId) {
    const now = new Date().toISOString();
    const submittedExistingIds = new Set(
      submittedSizes.flatMap((size) => (size.id ? [size.id] : []))
    );

    const { error: clearSubscriptionError } = await supabase
      .from('meal_sizes')
      .update({ is_available_for_subscription: false, updated_at: now })
      .eq('meal_id', mealId)
      .eq('is_available_for_subscription', true);
    throwIfError(clearSubscriptionError, 'Subscription-size reset');

    for (const existing of existingSizes) {
      if (!submittedExistingIds.has(existing.id)) {
        const { error } = await supabase
          .from('meal_sizes')
          .update({
            is_active: false,
            is_available_for_one_time: false,
            is_available_for_subscription: false,
            updated_at: now,
          })
          .eq('id', existing.id)
          .eq('meal_id', mealId);
        throwIfError(error, 'Meal-size deactivation');
      }
    }

    // Temporary labels allow two existing rows to swap labels without hitting
    // the per-meal unique-label constraint between sequential updates.
    for (const size of submittedSizes.filter((item) => item.id)) {
      const { error } = await supabase
        .from('meal_sizes')
        .update({ label: `__updating__${size.id}`, updated_at: now })
        .eq('id', size.id!)
        .eq('meal_id', mealId);
      throwIfError(error, 'Meal-size preparation');
    }

    const idsByRowKey = new Map<string, string>();
    for (const size of submittedSizes) {
      const values = {
        meal_id: mealId,
        label: size.label,
        servings: size.servings,
        price_cents: size.priceCents,
        is_active: size.isActive,
        is_available_for_one_time: size.oneTimeEligible,
        is_available_for_subscription: false,
        sort_order: size.sortOrder,
        updated_at: now,
      };

      if (size.id) {
        const { error } = await supabase
          .from('meal_sizes')
          .update(values)
          .eq('id', size.id)
          .eq('meal_id', mealId);
        throwIfError(error, 'Meal-size update');
        idsByRowKey.set(size.rowKey, size.id);
      } else {
        const { data, error } = await supabase
          .from('meal_sizes')
          .insert(values)
          .select('id')
          .single();
        throwIfError(error, 'Meal-size creation');
        if (!data?.id) throw new Error('Meal-size creation did not return an ID.');
        idsByRowKey.set(size.rowKey, data.id);
      }
    }

    const subscriptionSize = submittedSizes.find((size) => size.subscriptionEligible);
    if (subscriptionSize) {
      const subscriptionSizeId = idsByRowKey.get(subscriptionSize.rowKey);
      if (!subscriptionSizeId) throw new Error('The subscription size could not be resolved.');
      const { error } = await supabase
        .from('meal_sizes')
        .update({ is_available_for_subscription: true, updated_at: now })
        .eq('id', subscriptionSizeId)
        .eq('meal_id', mealId)
        .eq('is_active', true);
      throwIfError(error, 'Subscription-size selection');
    }
  }

  revalidatePath('/admin/meals');
  revalidatePath('/menu');
}

export async function deleteMeal(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get('id') as string;
  if (!id) return;

  // Meals referenced by past orders can't be hard-deleted (the foreign key is
  // ON DELETE RESTRICT, deliberately — you don't want order history to vanish).
  // Fall back to deactivating so it drops off the menu but history survives.
  const { error } = await supabase.from('meals').delete().eq('id', id);
  if (error) {
    await supabase.from('meals').update({ is_active: false }).eq('id', id);
  }

  revalidatePath('/admin/meals');
  revalidatePath('/menu');
}

export async function toggleMealActive(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get('id') as string;
  const next = formData.get('next') === 'true';
  await supabase.from('meals').update({ is_active: next }).eq('id', id);
  revalidatePath('/admin/meals');
  revalidatePath('/menu');
}

// ---------------- WEEKLY MENUS ----------------

export async function createWeeklyMenu(formData: FormData) {
  const supabase = await requireAdmin();
  const weekStart = formData.get('week_start') as string;
  if (!weekStart) return;
  await supabase.from('weekly_menus').insert({ week_start: weekStart });
  revalidatePath('/admin/menus');
}

export async function toggleMenuPublished(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get('id') as string;
  const next = formData.get('next') === 'true';
  await supabase.from('weekly_menus').update({ is_published: next }).eq('id', id);
  revalidatePath('/admin/menus');
  revalidatePath('/menu');
}

export async function setMenuItem(formData: FormData) {
  const supabase = await requireAdmin();
  const menuId = formData.get('menu_id') as string;
  const mealId = formData.get('meal_id') as string;
  const include = formData.get('include') === 'true';

  if (include) {
    await supabase
      .from('weekly_menu_items')
      .upsert({ menu_id: menuId, meal_id: mealId }, { onConflict: 'menu_id,meal_id' });
  } else {
    await supabase
      .from('weekly_menu_items')
      .delete()
      .eq('menu_id', menuId)
      .eq('meal_id', mealId);
  }
  revalidatePath('/admin/menus');
  revalidatePath('/menu');
}

// ---------------- ORDERS ----------------

export async function setOrderStatus(formData: FormData) {
  const supabase = await requireAdmin();
  const id = formData.get('id') as string;
  const status = formData.get('status') as string;

  await supabase.from('orders').update({ status }).eq('id', id);

  // Marking an order delivered is the moment containers leave the kitchen, so
  // that's when we log them against the customer.
  if (status === 'delivered') {
    const { data: order } = await supabase
      .from('orders')
      .select('id, customer_id, containers_issued, deposit_cents')
      .eq('id', id)
      .single();

    if (order && order.containers_issued > 0) {
      const { data: already } = await supabase
        .from('container_events')
        .select('id')
        .eq('order_id', order.id)
        .eq('kind', 'issued')
        .maybeSingle();

      if (!already) {
        await supabase.from('container_events').insert({
          customer_id: order.customer_id,
          order_id: order.id,
          kind: 'issued',
          quantity: order.containers_issued,
          deposit_delta_cents: order.deposit_cents,
          note: 'Delivered',
        });
      }
    }
  }

  revalidatePath('/admin/orders');
  revalidatePath('/admin/customers');
}

// ---------------- CONTAINERS ----------------

export async function logContainerReturn(formData: FormData) {
  const supabase = await requireAdmin();
  const customerId = formData.get('customer_id') as string;
  const quantity = toInt(formData.get('quantity')) ?? 0;
  const refund = formData.get('refund') === 'on';
  if (!customerId || quantity <= 0) return;

  await supabase.from('container_events').insert({
    customer_id: customerId,
    kind: 'returned',
    quantity,
    deposit_delta_cents: refund ? -quantity * DEPOSIT_PER_CONTAINER_CENTS : 0,
    note: refund ? 'Returned — deposit refunded' : 'Returned — deposit held for next order',
  });

  revalidatePath('/admin/customers');
}

export async function logContainerLost(formData: FormData) {
  const supabase = await requireAdmin();
  const customerId = formData.get('customer_id') as string;
  const quantity = toInt(formData.get('quantity')) ?? 0;
  if (!customerId || quantity <= 0) return;

  // Container is gone; the deposit is kept, which is exactly what it's for.
  await supabase.from('container_events').insert({
    customer_id: customerId,
    kind: 'lost',
    quantity,
    deposit_delta_cents: -quantity * DEPOSIT_PER_CONTAINER_CENTS,
    note: 'Not returned — deposit forfeited',
  });

  revalidatePath('/admin/customers');
}
