'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
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

// ---------------- MEALS ----------------

export async function saveMeal(formData: FormData) {
  const supabase = createAdminClient();
  const id = formData.get('id') as string | null;
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

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
  };

  let mealId = id;
  if (id) {
    await supabase.from('meals').update(row).eq('id', id);
  } else {
    const { data } = await supabase.from('meals').insert(row).select('id').single();
    mealId = data?.id ?? null;
  }

  if (mealId) {
    const labels = formData.getAll('size_label').map(String);
    const prices = formData.getAll('size_price').map(String);
    const sizes = labels
      .map((label, i) => ({ label: label.trim(), price: prices[i]?.trim() }))
      .filter((s) => s.label && s.price)
      .map((s, i) => ({
        meal_id: mealId,
        label: s.label,
        price_cents: Math.round(parseFloat(s.price!) * 100),
        sort_order: i,
      }));

    await supabase.from('meal_sizes').delete().eq('meal_id', mealId);
    if (sizes.length > 0) {
      await supabase.from('meal_sizes').insert(sizes);
    }
  }

  revalidatePath('/admin/meals');
  revalidatePath('/menu');
}

export async function deleteMeal(formData: FormData) {
  const id = formData.get('id') as string;
  if (!id) return;
  const supabase = createAdminClient();

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
  const id = formData.get('id') as string;
  const next = formData.get('next') === 'true';
  const supabase = createAdminClient();
  await supabase.from('meals').update({ is_active: next }).eq('id', id);
  revalidatePath('/admin/meals');
  revalidatePath('/menu');
}

// ---------------- WEEKLY MENUS ----------------

export async function createWeeklyMenu(formData: FormData) {
  const weekStart = formData.get('week_start') as string;
  if (!weekStart) return;
  const supabase = createAdminClient();
  await supabase.from('weekly_menus').insert({ week_start: weekStart });
  revalidatePath('/admin/menus');
}

export async function toggleMenuPublished(formData: FormData) {
  const id = formData.get('id') as string;
  const next = formData.get('next') === 'true';
  const supabase = createAdminClient();
  await supabase.from('weekly_menus').update({ is_published: next }).eq('id', id);
  revalidatePath('/admin/menus');
  revalidatePath('/menu');
}

export async function setMenuItem(formData: FormData) {
  const menuId = formData.get('menu_id') as string;
  const mealId = formData.get('meal_id') as string;
  const include = formData.get('include') === 'true';
  const supabase = createAdminClient();

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
  const id = formData.get('id') as string;
  const status = formData.get('status') as string;
  const supabase = createAdminClient();

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
  const customerId = formData.get('customer_id') as string;
  const quantity = toInt(formData.get('quantity')) ?? 0;
  const refund = formData.get('refund') === 'on';
  if (!customerId || quantity <= 0) return;

  const supabase = createAdminClient();
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
  const customerId = formData.get('customer_id') as string;
  const quantity = toInt(formData.get('quantity')) ?? 0;
  if (!customerId || quantity <= 0) return;

  const supabase = createAdminClient();
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
