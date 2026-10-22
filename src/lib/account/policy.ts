export const ORDER_CHANGE_WINDOW_HOURS = 24;
export const ORDER_CHANGE_POLICY =
  'Orders can be canceled only within 24 hours of being placed. Meal, quantity, and delivery-address changes are available within the same 24-hour window, before preparation begins.';
export function orderChangeDeadline(createdAt: string) {
  return new Date(
    new Date(createdAt).getTime() + ORDER_CHANGE_WINDOW_HOURS * 3600000,
  );
}
export function canCancelOrder(
  order: { created_at: string; status: string },
  now = Date.now(),
) {
  return (
    Number.isFinite(Date.parse(order.created_at)) &&
    now >= Date.parse(order.created_at) &&
    now < orderChangeDeadline(order.created_at).getTime() &&
    ['pending', 'paid', 'packing'].includes(order.status)
  );
}
export function canEditOrder(
  order: { created_at: string; status: string },
  now = Date.now(),
) {
  return (
    canCancelOrder(order, now) && ['pending', 'paid'].includes(order.status)
  );
}
