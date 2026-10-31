import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { buildMenuEmailPreview, MENU_EMAIL_FROM, MENU_EMAIL_REPLY_TO, type MenuEmailPreview } from './menu-announcement';
import type { Meal } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_SEGMENT = 'aa952e1a-0da7-4c8d-9455-041df327a843';
type Admin = { supabase: SupabaseClient; userId: string };
type Announcement = { id: string; status: string; stage: string; broadcast_id: string | null; recipient_count: number; last_error: string | null };
type Context = { snapshot: { week_start: string; items: { sold_out: boolean; meal: Meal }[] }; published: boolean; closes_at: string; latest_published_week: string | null; announcement: Announcement | null };
export type AnnouncementReview = { preview: MenuEmailPreview; recipientCount: number; token: string | null; status: string | null; broadcastId: string | null; message: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function config() {
  const key = process.env.RESEND_API_KEY;
  const segment = process.env.RESEND_MENU_SEGMENT_ID || DEFAULT_SEGMENT;
  if (!key) throw new Error('Resend must be configured before reviewing customer announcements.');
  if (!UUID.test(segment)) throw new Error('The menu subscriber segment is not configured correctly.');
  return { key, segment };
}
class ProviderError extends Error {
  constructor(public status: number) { super(`Resend request failed (${status}). Check your Resend account and retry.`); }
}
let nextProviderRequestAt = 0;
async function provider(path: string, method = 'GET', body?: unknown) {
  const now = Date.now();
  const wait = Math.max(0, nextProviderRequestAt - now);
  nextProviderRequestAt = Math.max(now, nextProviderRequestAt) + 550;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const response = await fetch(`https://api.resend.com${path}`, { method,
    headers: { Authorization: `Bearer ${config().key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) throw new ProviderError(response.status);
  return response.json();
}
async function list(path: string) {
  const records: { id: string; email: string; unsubscribed?: boolean }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const result = await provider(`${path}${path.includes('?') ? '&' : '?'}limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(result.data)) throw new Error('Unable to confirm the subscriber list.');
    records.push(...result.data);
    if (!result.has_more) return records;
    const next = result.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error('Unable to finish checking the subscriber list.');
    cursor = next;
  }
  throw new Error('The subscriber list is too large to confirm in one request.');
}
async function audience() {
  const { segment } = config();
  const contacts = await list(`/contacts?segment_id=${segment}`);
  const suppressed = new Set((await list('/suppressions')).map((row) => row.email.trim().toLowerCase()));
  const emails = Array.from(new Set(contacts.filter((row) => !row.unsubscribed).map((row) => row.email.trim().toLowerCase())))
    .filter((email) => !suppressed.has(email)).sort();
  return { count: emails.length, hash: digest({ segment, emails }) };
}
async function context(admin: Admin, menuId: string): Promise<Context> {
  if (!UUID.test(menuId)) throw new Error('Choose a valid menu.');
  const { data, error } = await admin.supabase.rpc('menu_announcement_context', { p_menu_id: menuId });
  if (error) throw new Error('Apply the menu announcements migration before enabling customer sends.');
  if (!data) throw new Error('Menu not found.');
  return data as Context;
}
function previewFor(ctx: Context) {
  return buildMenuEmailPreview(ctx.snapshot.week_start, ctx.published,
    ctx.snapshot.items.filter((item) => !item.sold_out).map((item) => item.meal),
    process.env.NEXT_PUBLIC_SITE_URL || 'https://mealplan.yoursouthernfoodie.com', 'customer');
}
function assertCurrent(ctx: Context) {
  if (!Number.isFinite(Date.parse(ctx.closes_at)) || Date.now() >= Date.parse(ctx.closes_at)) throw new Error('Ordering for this menu has closed. No announcement was sent.');
  if (ctx.latest_published_week && ctx.latest_published_week > ctx.snapshot.week_start) throw new Error('A newer menu is already published. Choose the current menu.');
}
function revision(ctx: Context, preview: MenuEmailPreview) { return digest({ snapshot: ctx.snapshot, subject: preview.subject, html: preview.html, text: preview.text }); }
function sign(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', config().key).update(body).digest('base64url')}`;
}
function verify(token: string, menuId: string) {
  if (typeof token !== 'string' || token.length > 3000) throw new Error('Review the announcement before confirming.');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw new Error('Review the announcement again.');
  const expected = createHmac('sha256', config().key).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('The announcement confirmation is invalid. Review it again.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { menuId: string; revision: string; audience: string; count: number; expires: number; actor: string };
  if (payload.menuId !== menuId || !Number.isFinite(payload.expires) || payload.expires <= Date.now()) throw new Error('The confirmation expired. Review the announcement again.');
  return payload;
}
function statusMessage(row: Announcement) {
  if (row.status === 'queued') return 'This week’s announcement has already been queued. Editing or republishing will not resend it.';
  if (row.status === 'failed') return 'The previous draft creation was rejected. You can review and retry.';
  return 'An announcement is already being handled. Check its status before trying again.';
}

export async function reviewAnnouncement(admin: Admin, menuId: string): Promise<AnnouncementReview> {
  config();
  const ctx = await context(admin, menuId);
  const preview = previewFor(ctx);
  const row = ctx.announcement;
  if (row && row.status !== 'failed') return { preview, recipientCount: row.recipient_count, token: null, status: row.status, broadcastId: row.broadcast_id, message: statusMessage(row) };
  assertCurrent(ctx);
  const recipients = await audience();
  if (!recipients.count) throw new Error('There are no eligible subscribed customers to notify.');
  return { preview, recipientCount: recipients.count,
    token: sign({ menuId, revision: revision(ctx, preview), audience: recipients.hash, count: recipients.count, expires: Date.now() + 15 * 60000, actor: admin.userId }),
    status: row?.status ?? null, broadcastId: row?.broadcast_id ?? null, message: row ? statusMessage(row) : null };
}

async function update(admin: Admin, id: string, attempt: string, values: Record<string, unknown>) {
  const { data, error } = await admin.supabase.from('menu_announcements').update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id).eq('attempt_id', attempt).select('id').single();
  if (error || !data) throw new Error('Unable to save announcement status. Check the announcement in Resend before retrying.');
}

export async function confirmAnnouncement(admin: Admin, menuId: string, token: string, confirmed: boolean) {
  if (confirmed !== true) throw new Error('Confirm that you want to email the subscribed customers.');
  const proof = verify(token, menuId);
  if (proof.actor !== admin.userId) throw new Error('Review the announcement from your own administrator account.');
  const ctx = await context(admin, menuId);
  if (ctx.announcement && ctx.announcement.status !== 'failed') return { queued: ctx.announcement.status === 'queued', message: statusMessage(ctx.announcement) };
  assertCurrent(ctx);
  const preview = previewFor(ctx);
  if (proof.revision !== revision(ctx, preview)) throw new Error('The menu changed. Review the email again.');
  const recipients = await audience();
  if (!recipients.count || recipients.count !== proof.count || recipients.hash !== proof.audience) throw new Error('The recipient list changed. Review the recipient count again.');
  const { data, error } = await admin.supabase.rpc('reserve_menu_announcement', {
    p_actor_id: admin.userId, p_menu_id: menuId, p_snapshot: ctx.snapshot, p_revision: proof.revision,
    p_segment_id: config().segment, p_audience_hash: recipients.hash, p_recipient_count: recipients.count,
    p_subject: preview.subject, p_html: preview.html, p_text: preview.text,
  });
  if (error || !data) throw new Error(error?.message || 'Unable to reserve this announcement. No email was sent.');
  const claim = data as { claimed: boolean; id: string; attempt_id: string; status: string; broadcast_id: string | null };
  if (!claim.claimed) return { queued: claim.status === 'queued', message: 'This announcement is already being handled. Refresh its status.' };
  revalidatePath('/admin/menus'); revalidatePath('/menu'); revalidatePath('/');
  let stage: 'create' | 'send' = 'create';
  try {
    let broadcastId = claim.broadcast_id;
    if (broadcastId) {
      const existing = await provider(`/broadcasts/${broadcastId}`);
      if (['queued', 'sending', 'sent', 'scheduled'].includes(existing.status)) {
        await update(admin, claim.id, claim.attempt_id, { status: 'queued', provider_status: existing.status, queued_at: new Date().toISOString() });
        return { queued: true, message: 'Resend already has this announcement. No second copy was sent.' };
      }
      if (existing.status !== 'draft') throw new Error('The saved broadcast cannot be sent. Review it in Resend.');
    }
    if (!broadcastId) {
      // Create only a draft. Its ID must be saved before a send can be attempted.
      const broadcast = await provider('/broadcasts', 'POST', {
        name: `netta-menu-${menuId}-${claim.id}`, segment_id: config().segment,
        from: MENU_EMAIL_FROM, reply_to: MENU_EMAIL_REPLY_TO, subject: preview.subject,
        html: preview.html, text: preview.text, send: false,
      });
      if (!UUID.test(broadcast.id)) throw new Error('Resend did not confirm the draft.');
      broadcastId = broadcast.id;
    }
    await update(admin, claim.id, claim.attempt_id, { broadcast_id: broadcastId, status: 'draft' });
    const refreshedAudience = await audience();
    if (refreshedAudience.hash !== proof.audience) throw new Error('The recipient list changed after publishing. Review the draft in Resend before sending.');
    const begin = await admin.supabase.rpc('begin_menu_announcement_send', { p_actor_id: admin.userId, p_announcement_id: claim.id, p_attempt_id: claim.attempt_id });
    if (begin.error || begin.data !== true) throw new Error(begin.error?.message || 'Unable to confirm this send.');
    stage = 'send';
    const receipt = await provider(`/broadcasts/${broadcastId}/send`, 'POST', {});
    if (receipt.id !== broadcastId) throw new Error('Resend did not confirm the broadcast receipt.');
    await update(admin, claim.id, claim.attempt_id, { status: 'queued', provider_status: 'queued', queued_at: new Date().toISOString(), last_error: null });
    revalidatePath('/admin/menus');
    return { queued: true, message: `Menu published. Resend accepted the announcement for up to ${recipients.count} subscribed customers. Delivery details are available in Resend.` };
  } catch (failure) {
    const safelyRejected = stage === 'create' && failure instanceof ProviderError && [400, 401, 403, 422, 429].includes(failure.status);
    try { await update(admin, claim.id, claim.attempt_id, { status: safelyRejected ? 'failed' : 'needs_review', last_error: failure instanceof Error ? failure.message : 'Unable to confirm announcement status.' }); } catch { /* A reservation already exists; never automatically create another broadcast. */ }
    throw new Error('The menu is published, but the announcement could not be confirmed. Check its status before retrying; no automatic resend will occur.');
  }
}

export async function checkAnnouncement(admin: Admin, menuId: string) {
  const ctx = await context(admin, menuId);
  const row = ctx.announcement;
  if (!row) return { queued: false, message: 'No announcement has been started for this menu.' };
  if (row.status === 'queued') return { queued: true, message: statusMessage(row) };
  if (!row.broadcast_id) return { queued: false, message: 'Draft creation is unconfirmed. Review Resend before retrying. No automatic resend will occur.' };
  const broadcast = await provider(`/broadcasts/${row.broadcast_id}`);
  if (['queued', 'sending', 'sent', 'scheduled'].includes(broadcast.status)) {
    const { error } = await admin.supabase.from('menu_announcements').update({ status: 'queued', provider_status: broadcast.status, queued_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq('id', row.id).eq('broadcast_id', row.broadcast_id);
    if (error) throw new Error('Resend has the announcement, but its local status could not be saved. Do not send another copy.');
    revalidatePath('/admin/menus');
    return { queued: true, message: `Resend reports this announcement as ${broadcast.status}. It will not be resent.` };
  }
  return { queued: false, message: `Resend reports this announcement as ${String(broadcast.status)}. Review it in Resend before taking further action.` };
}
