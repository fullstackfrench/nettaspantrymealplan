const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requires = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports, Number, Error, require: (name) => { if (!(name in requires)) throw new Error(name); return requires[name]; } });
 return exports;
}
const minimum = load('src/lib/minimum-order.ts');
const { assertSelectionMinimum } = load('src/lib/account/minimum-order.ts', { '../minimum-order': minimum });
test('the food minimum accepts $55 exactly and rejects $54.99 and invalid totals', () => {
 for (const total of [0, 5499, -1, NaN, Infinity, 5500.5]) assert.equal(minimum.meetsOrderMinimum(total), false);
 for (const total of [5500, 8100, 10500, 16500]) assert.equal(minimum.meetsOrderMinimum(total), true);
});
function database({ price = 1000, original = [], fail = false } = {}) {
 return { from(table) {
  const q = { select() { return q; }, in() { return q; }, eq() { return q; }, then(resolve) {
   return Promise.resolve({ error: fail ? { message: 'offline' } : null,
    data: table === 'meal_sizes' ? [{ id: 'size', meal_id: 'meal', price_cents: price }] : original }).then(resolve);
  } }; return q;
 } };
}
const items = (quantity) => [{ mealId: 'meal', mealSizeId: 'size', quantity }];
test('checkout minimum uses database prices instead of any browser amount', async () => {
 await assert.rejects(assertSelectionMinimum(database(), items(5)), /minimum food order/);
 await assertSelectionMinimum(database({ price: 1100 }), items(5));
 await assert.rejects(assertSelectionMinimum(database({ fail: true }), items(6)), /verify meal prices/);
});
test('edits preserve original line prices only when the quantity is unchanged', async () => {
 const db = database({ price: 500, original: [{ meal_id: 'meal', meal_size_id: 'size', quantity: 6, unit_price_cents: 1000 }] });
 await assertSelectionMinimum(db, items(6), 'order');
 await assert.rejects(assertSelectionMinimum(db, items(5), 'order'), /minimum food order/);
});
test('unknown sizes and invalid quantities do not pass the server check', async () => {
 for (const quantity of [0, -1, 1.5, 1001]) await assert.rejects(assertSelectionMinimum(database(), items(quantity)), /whole-number/);
 await assert.rejects(assertSelectionMinimum(database(), [{ mealId: 'other', mealSizeId: 'size', quantity: 6 }]), /unavailable/);
});
test('existing Stripe checkouts cannot bypass the server food minimum', async () => {
 for (const subtotal of [5499, 5500]) {
  let stripeCalls = 0;
  const q = { select() { return q; }, eq() { return q; }, single: async () => ({ error: null, data: {
   id: 'order', status: 'pending', subtotal_cents: subtotal, total_cents: 6500,
   stripe_checkout_session_id: 'cs_existing', customer_change_id: null,
  } }) };
  const payments = load('src/lib/account/payments.ts', {
   'server-only': {}, './plan-prices': {}, '@/lib/minimum-order': minimum,
   '@/lib/supabase/server': { createAdminClient: () => ({ from: () => q }) },
   './server': { stripeClient: () => { stripeCalls++; return { checkout: { sessions: {
    retrieve: async () => ({ status: 'open', url: 'https://checkout.example.test' }),
   } } }; } },
  });
  if (subtotal < 5500) {
   await assert.rejects(payments.createOrderCheckout('order', 'customer'), /minimum food order/);
   assert.equal(stripeCalls, 0);
  } else {
   assert.equal(await payments.createOrderCheckout('order', 'customer'), 'https://checkout.example.test');
  }
 }
});
