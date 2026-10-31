import type { Meal } from '@/lib/types';
import { getAvailableMealSizes } from '@/lib/meal-availability';
import { getSubscriptionKind } from '@/lib/subscription-mix';

export const MENU_EMAIL_FROM = 'Chef Netta <chefnetta@yoursouthernfoodie.com>';
export const MENU_EMAIL_REPLY_TO = 'chefnetta@yoursouthernfoodie.com';
export const MENU_EMAIL_ADDRESS = '2161 South Wilmington St., Raleigh, NC 27603';

export type MenuEmailPreview = { subject: string; html: string; text: string; mealCount: number; draft: boolean };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

export function buildMenuEmailPreview(weekStart: string, published: boolean, meals: Meal[], siteUrl: string): MenuEmailPreview {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw new Error('Choose a valid menu week.');
  const date = new Date(`${weekStart}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== weekStart || date.getUTCDay() !== 1) {
    throw new Error('The menu week must start on a Monday.');
  }
  const url = new URL('/menu', siteUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('The site URL is not configured correctly.');
  const weekLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  const deadline = `Order by Monday, ${weekLabel} at 8:00 p.m. Eastern.`;
  const available = meals.filter((meal) => getAvailableMealSizes(meal, 'one_time').length || getAvailableMealSizes(meal, 'subscription').length)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (!available.length) throw new Error('Add at least one available meal to this menu before previewing an email.');
  const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  function mealSummary(meal: Meal) {
    const sizes = getAvailableMealSizes(meal, 'one_time').sort((a, b) => (a.servings ?? 0) - (b.servings ?? 0));
    const pricing = sizes.length
      ? sizes.map((size) => `${size.label} (serves ${size.servings}): ${dollars(size.price_cents)}`).join(' · ')
      : 'Available with a subscription';
    return { meal, pricing };
  }
  const groups = [
    { title: 'Entrées', meals: available.filter((meal) => getSubscriptionKind(meal) === 'entree') },
    { title: 'Sides', meals: available.filter((meal) => getSubscriptionKind(meal) === 'side') },
    { title: 'More from the kitchen', meals: available.filter((meal) => !getSubscriptionKind(meal)) },
  ].filter((group) => group.meals.length);
  const subject = `Fresh from Chef Netta: menu for ${weekLabel}`;
  const htmlMeals = groups.map((group) => `<h2 style="margin:28px 0 12px;color:#642550;font-family:Georgia,serif;font-size:24px">${group.title}</h2>${group.meals.map(mealSummary).map(({ meal, pricing }) => {
    const description = (meal.description ?? '').split('Estimated nutrition per person')[0].trim();
    return `<div style="padding:14px 0;border-bottom:1px solid #e9dfd6"><h3 style="margin:0 0 6px;color:#642550;font-size:18px">${escapeHtml(meal.name)}</h3>${description ? `<p style="margin:0 0 8px;line-height:1.6;color:#49413d">${escapeHtml(description)}</p>` : ''}<p style="margin:0;font-size:14px;color:#642550">${escapeHtml(pricing)}</p></div>`;
  }).join('')}`).join('');
  const testNote = `Test email only${published ? '' : ' — this menu is still a draft'}. Customer announcements are not enabled. The ordering button opens the currently published menu.`;
  const text = ['NETTA’S PANTRY', `Menu for ${weekLabel}`, testNote, '', 'Good things are cooking! Take a look at what Chef Netta is preparing this week.', deadline, ...groups.flatMap((group) => ['', group.title, ...group.meals.map(mealSummary).map(({ meal, pricing }) => `${meal.name} — ${pricing}`)]), '', `View menu & order: ${url.href}`, '', `Questions? Reply to ${MENU_EMAIL_REPLY_TO}`, MENU_EMAIL_ADDRESS, 'This is an administrator test. Customer announcements will include an unsubscribe link.'].join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:20px 12px;background:#faf6f0;font-family:Arial,sans-serif;color:#302826"><table role="presentation" style="width:100%;max-width:640px;margin:auto;border-collapse:collapse;background:#ffffff"><tr><td style="padding:30px 24px;background:#642550;color:#ffffff;text-align:center"><p style="margin:0 0 8px;color:#d8c487;letter-spacing:3px;font-size:13px">NETTA’S PANTRY</p><h1 style="margin:0;font-family:Georgia,serif;font-size:30px">Good things are cooking.</h1><p style="margin:12px 0 0">Menu for ${escapeHtml(weekLabel)}</p></td></tr><tr><td style="padding:24px"><p style="margin:0 0 20px;padding:12px;background:#faf6f0;font-size:13px;line-height:1.5">${escapeHtml(testNote)}</p><p style="line-height:1.6">Take a look at what Chef Netta is preparing this week.</p><p style="font-weight:bold;color:#642550;line-height:1.6">${escapeHtml(deadline)}</p>${htmlMeals}<p style="margin:30px 0;text-align:center"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:15px 24px;border-radius:28px;background:#d8c487;color:#302826;text-decoration:none;font-weight:bold">View Menu &amp; Order</a></p><p style="line-height:1.6;font-size:14px">Questions? Reply to <a href="mailto:${MENU_EMAIL_REPLY_TO}" style="color:#642550">${MENU_EMAIL_REPLY_TO}</a>.</p></td></tr><tr><td style="padding:20px 24px;background:#faf6f0;text-align:center;font-size:12px;line-height:1.7;color:#6b6059">${MENU_EMAIL_ADDRESS}<br>This is an administrator test. Customer announcements will include an unsubscribe link.</td></tr></table></body></html>`;
  return { subject, html, text, mealCount: available.length, draft: !published };
}
