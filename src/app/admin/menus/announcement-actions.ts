'use server';

import { requireAdminContext } from '@/lib/auth/require-admin';
import { reviewAnnouncement, confirmAnnouncement, checkAnnouncement, type AnnouncementReview } from '@/lib/email/menu-broadcasts';

export async function reviewMenuAnnouncement(menuId: string): Promise<{ review?: AnnouncementReview; error?: string }> {
  try { return { review: await reviewAnnouncement(await requireAdminContext(), menuId) }; }
  catch (error) { return { error: error instanceof Error ? error.message : 'Unable to review this announcement.' }; }
}

export async function publishAndNotify(menuId: string, token: string, confirmed: boolean): Promise<{ queued: boolean; message?: string; error?: string }> {
  try { return await confirmAnnouncement(await requireAdminContext(), menuId, token, confirmed); }
  catch (error) { return { queued: false, error: error instanceof Error ? error.message : 'Unable to confirm the announcement. Check its status before retrying.' }; }
}

export async function checkMenuAnnouncement(menuId: string): Promise<{ queued: boolean; message?: string; error?: string }> {
  try { return await checkAnnouncement(await requireAdminContext(), menuId); }
  catch (error) { return { queued: false, error: error instanceof Error ? error.message : 'Unable to check the announcement status.' }; }
}
