export const WEEKLY_CUTOFF_MESSAGE = 'New weekly orders and meal selections close Monday at 8:00 p.m. Eastern.';

export function isOrderingWindowOpen(closesAt: string | null, now = Date.now()) {
  return closesAt !== null && Number.isFinite(Date.parse(closesAt)) && now < Date.parse(closesAt);
}
