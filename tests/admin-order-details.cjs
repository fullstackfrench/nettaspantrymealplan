const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, overrides = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, FormData, Error, require(name) {
    return name in overrides ? overrides[name] : require(name);
  } });
  return exports;
}
const helpers = load('src/lib/admin/order-details.ts');
const id = '11111111-1111-4111-8111-111111111111';
function scenario({ authorized = true, orderError = null, noteError = null, eventsError = null, historyError = null, missing = false } = {}) {
  const calls = [];
  const order = { id, delivery_address_line1: '12 Saved St', customers: { address_line1: '99 Current St' } };
  const db = { from(table) {
    const q = {
      select: () => q,
      eq(key, value) { calls.push(['eq', table, key, value]); return q; },
      order: () => q,
      upsert(row) { calls.push(['upsert', table, row]); return q; },
      maybeSingle: async () => table === 'orders'
        ? { data: missing ? null : order, error: orderError }
        : { data: { note: 'Private note' }, error: noteError },
      then(resolve) { return Promise.resolve({ data: [], error: table === 'container_events' ? eventsError : table === 'order_fulfillment_history' ? historyError : noteError }).then(resolve); },
    };
    calls.push(['from', table]); return q;
  } };
  const actions = load('src/app/admin/orders/actions.ts', {
    '@/lib/auth/require-admin': { requireAdmin: async () => { if (!authorized) throw Error('Unauthorized'); return db; } },
    '../actions': { setOrderStatus: async (form) => { if (!authorized) throw Error('Unauthorized'); calls.push(['status', form.get('id'), form.get('status')]); } },
  });
  return { actions, calls };
}

test('order details require admin authorization before reading private records', async () => {
  const { actions, calls } = scenario({ authorized: false });
  assert.match((await actions.loadOrderDetails(id)).error, /Unauthorized/);
  assert.match((await actions.saveOrderNote(id, 'note')).error, /Unauthorized/);
  assert.match((await actions.updateOrderFromModal(id, 'delivered')).error, /Unauthorized/);
  assert.equal(calls.length, 0);
});
test('details load saved address, order-linked containers and separate private notes', async () => {
  const { actions, calls } = scenario();
  const { data } = await actions.loadOrderDetails(id);
  assert.equal(data.order.delivery_address_line1, '12 Saved St');
  assert.equal(data.note, 'Private note');
  assert.equal(data.notesAvailable, true);
  assert(calls.some(c => c[0] === 'eq' && c[1] === 'container_events' && c[2] === 'order_id' && c[3] === id));
  assert(calls.some(c => c[0] === 'eq' && c[1] === 'admin_order_notes' && c[2] === 'order_id' && c[3] === id));
});
test('notes migration can be pending without blocking real order details', async () => {
  for (const code of ['42P01', 'PGRST205']) {
    const { actions } = scenario({ noteError: { code } });
    assert.equal((await actions.loadOrderDetails(id)).data.notesAvailable, false);
  }
});
test('database failures and missing orders surface useful errors', async () => {
  assert.match((await scenario({ orderError: {} }).actions.loadOrderDetails(id)).error, /could not be loaded/);
  assert.match((await scenario({ missing: true }).actions.loadOrderDetails(id)).error, /not be found/);
  assert.match((await scenario({ eventsError: {} }).actions.loadOrderDetails(id)).error, /Container records/);
  assert.match((await scenario({ noteError: { code: '42501' } }).actions.loadOrderDetails(id)).error, /Internal notes/);
});
test('invalid order IDs and oversized notes cannot write records', async () => {
  const { actions, calls } = scenario();
  assert.match((await actions.loadOrderDetails('invalid')).error, /Invalid order/);
  assert.match((await actions.saveOrderNote(id, 'x'.repeat(5001))).error, /5,000/);
  assert(!calls.some(c => c[0] === 'upsert'));
});
test('note saves write only the private notes table', async () => {
  const { actions, calls } = scenario();
  assert.equal((await actions.saveOrderNote(id, '  Keep upright  ')).saved, true);
  const write = calls.find(c => c[0] === 'upsert');
  assert.equal(write[1], 'admin_order_notes');
  assert.equal(write[2].order_id, id);
  assert.equal(write[2].note, 'Keep upright');
  assert(!calls.some(c => c[0] === 'from' && c[1] === 'orders'));
});
test('modal status actions delegate to the authorized fulfillment action', async () => {
  const { actions, calls } = scenario();
  assert.equal((await actions.updateOrderFromModal(id, 'packed')).saved, true);
  assert(calls.some(c => c[0] === 'status' && c[1] === id && c[2] === 'packed'));
});
test('portion formatting never invents historical Half/Whole selections', () => {
  assert.equal(helpers.portionLabel('Half', 2), 'Half (serves 2)');
  assert.equal(helpers.portionLabel('Whole', 4), 'Whole (serves 4)');
  assert.equal(helpers.portionLabel('Regular', 1), 'Regular (serves 1)');
  assert.equal(helpers.portionLabel(null, 2), 'Serves 2 · portion name not recorded');
  assert.equal(helpers.portionLabel(null, null), 'Portion not recorded');
  assert.match(helpers.formatDeliveryDate('2026-10-26'), /Oct 26, 2026/);
});

function renderDetails(orderOverrides = {}) {
  const order = {
    id, created_at: '2026-10-26T16:00:00Z', status: 'paid', fulfillment_status: 'unfulfilled', order_type: 'one_time',
    contact_name: 'Saved Customer', contact_email: 'saved@example.test',
    delivery_address_line1: '12 Saved St', delivery_address_line2: 'Unit 7', delivery_city: 'Durham', delivery_zip: '27701', delivery_notes: 'Saved instructions',
    customers: { full_name: 'Current Customer', address_line1: '99 Current St', delivery_notes: 'Current instructions', phone: '555-1234', containers_out: 3, deposit_held_cents: 900 },
    subtotal_cents: 6000, tax_cents: 578, deposit_cents: 0, glass_fee_cents: 5000, delivery_fee_cents: 1000, total_cents: 12578, payment_status: 'paid', containers_issued: 3,
    order_items: [
      { id: 'half', meal_name_snapshot: 'Historical meal', size_label_snapshot: 'Half', servings_snapshot: 2, quantity: 2, unit_price_cents: 1500, meals: { name: 'Current menu name' } },
      { id: 'whole', meal_name_snapshot: 'Second meal', size_label_snapshot: 'Whole', servings_snapshot: 4, quantity: 1, unit_price_cents: 3000 },
    ], ...orderOverrides,
  };
  const states = [{ order, note: '', notesAvailable: false, containerEvents: [], history: [], trackingAvailable: true }, '', '', false, false, 0, ''];
  const component = load('src/components/admin/OrderDetailsModal.tsx', {
    react: { ...React, useState: () => [states.shift(), () => {}], useEffect() {}, useId: () => 'order-title', useRef: () => ({ current: true }) },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
    '@/components/ui/Dialog': { default: ({ children }) => React.createElement('div', null, children) },
    '@/app/admin/orders/actions': {},
    '@/lib/constants': { formatCents: n => `$${(n / 100).toFixed(2)}` },
    '@/lib/admin/order-details': helpers,
  }).default;
  return renderToStaticMarkup(React.createElement(component, { orderId: id, onClose() {} }));
}
test('modal displays saved delivery fields, mixed portion snapshots and stored payment amounts', () => {
  const html = renderDetails();
  for (const text of ['12 Saved St', 'Unit 7', '27701', 'Saved instructions', 'Half (serves 2)', 'Whole (serves 4)', 'Historical meal', '$125.78', '$50.00']) assert(html.includes(text), text);
  for (const text of ['99 Current St', 'Current instructions', 'Current menu name']) assert(!html.includes(text), text);
});
test('missing historical addresses are not substituted with the current profile address', () => {
  const html = renderDetails({ delivery_address_line1: null });
  assert(html.includes('No delivery address was saved'));
  assert(!html.includes('99 Current St'));
});
test('subscription items show Included while refunded totals are not mislabeled Total paid', () => {
  const html = renderDetails({ order_type: 'subscription', payment_status: 'refunded', order_items: [{ id: 'included', quantity: 6, unit_price_cents: 0, meal_name_snapshot: 'Plan meal', size_label_snapshot: 'Half', servings_snapshot: 2 }] });
  assert(html.includes('Included in subscription'));
  assert(!html.includes('Total paid'));
  assert(html.includes('Order total'));
});

test('fulfillment actions remain disabled when the migration is absent', async () => {
  const { data } = await scenario({ historyError: { code: 'PGRST205' } }).actions.loadOrderDetails(id);
  assert.equal(data.trackingAvailable, false);
  assert.equal(data.history.length, 0);
  assert.match((await scenario({ historyError: { code: '42501' } }).actions.loadOrderDetails(id)).error, /Fulfillment history/);
});
test('the modal exposes only the three normal stages and eligibility-based next actions', () => {
  const order = { status: 'paid', payment_status: 'paid', fulfillment_status: 'unfulfilled' };
  assert.equal(helpers.fulfillmentLabel(order), 'Needs Packing');
  assert.equal(helpers.nextFulfillmentStatus(order), 'packed');
  assert.equal(helpers.nextFulfillmentStatus({ ...order, fulfillment_status: 'packed' }), 'delivered');
  assert.equal(helpers.nextFulfillmentStatus({ ...order, fulfillment_status: 'delivered' }), null);
  assert.equal(helpers.nextFulfillmentStatus({ ...order, payment_status: 'unpaid' }), null);
  assert.equal(helpers.nextFulfillmentStatus({ ...order, customer_change_id: 'pending' }), null);
  assert.equal(helpers.nextFulfillmentStatus({ ...order, needs_meal_selection: true }), null);
  assert.equal(helpers.fulfillmentLabel({ ...order, fulfillment_status: 'canceled' }), 'Canceled');
});
