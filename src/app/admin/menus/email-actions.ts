'use server';

import { createHash } from 'crypto';
import { requireAdminContext } from '@/lib/auth/require-admin';
import { buildMenuEmailPreview, MENU_EMAIL_FROM, MENU_EMAIL_REPLY_TO, type MenuEmailPreview } from '@/lib/email/menu-announcement';
import type { Meal } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Admin = Awaited<ReturnType<typeof requireAdminContext>>;

async function readPreview(admin: Admin, menuId: string) {
  if (typeof menuId !== 'string' || !UUID.test(menuId)) throw new Error('Choose a valid menu.');
  const { data, error } = await admin.supabase.from('weekly_menus')
    .select('week_start,is_published,weekly_menu_items(sold_out,meals(*,meal_sizes(*)))')
    .eq('id', menuId).maybeSingle();
  if (error) throw new Error('Unable to load this menu. Please try again.');
  if (!data) throw new Error('Menu not found.');
  const menu = data as unknown as { week_start: string; is_published: boolean; weekly_menu_items: { sold_out: boolean; meals: Meal | null }[] };
  const meals = menu.weekly_menu_items.filter((item) => !item.sold_out && item.meals).map((item) => item.meals!);
  return buildMenuEmailPreview(menu.week_start, menu.is_published, meals, process.env.NEXT_PUBLIC_SITE_URL || 'https://mealplan.yoursouthernfoodie.com');
}

export async function previewMenuEmail(menuId: string): Promise<{ preview?: MenuEmailPreview; error?: string }> {
  try {
    const admin = await requireAdminContext();
    return { preview: await readPreview(admin, menuId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to preview this email.' };
  }
}

export async function sendMenuTestEmail(menuId: string, requestId: string): Promise<{ sent: boolean; to?: string; error?: string }> {
  try {
    const admin = await requireAdminContext();
    if (typeof requestId !== 'string' || !UUID.test(requestId)) throw new Error('Reload the preview before sending a test.');
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY must be configured on this environment before sending a test.');
    const { data, error } = await admin.supabase.auth.admin.getUserById(admin.userId);
    if (error || !data.user?.email || !data.user.email_confirmed_at) throw new Error('A verified administrator email is required to receive a test.');
    const preview = await readPreview(admin, menuId);
    const revision = createHash('sha256').update(preview.html).digest('hex').slice(0, 16);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `menu-test/${admin.userId}/${menuId}/${requestId}/${revision}` },
      body: JSON.stringify({ from: MENU_EMAIL_FROM, to: [data.user.email], reply_to: MENU_EMAIL_REPLY_TO,
        subject: `[TEST] ${preview.subject}`, html: preview.html, text: preview.text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error('Resend menu test rejected', { status: response.status });
      throw new Error('Resend could not accept the test email. Check domain verification, API key permissions and account limits, then retry.');
    }
    const result = await response.json();
    if (!result.id) throw new Error('Resend did not confirm the test email. Please retry.');
    return { sent: true, to: data.user.email };
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)) {
      return { sent: false, error: 'Unable to confirm the send. Retry to check the same test without sending a duplicate.' };
    }
    return { sent: false, error: error instanceof Error ? error.message : 'Unable to send the test email.' };
  }
}
