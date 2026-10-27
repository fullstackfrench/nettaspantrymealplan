const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, overrides = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, process: { env: { STRIPE_SECRET_KEY: 'test-only' } }, require(name) {
    return name in overrides ? overrides[name] : require(name);
  } });
  return exports;
}
const constants = load('src/lib/constants.ts');
const tax = load('src/lib/sales-tax.ts');
const minimum = load('src/lib/minimum-order.ts');

test('new one-time and subscription checkouts store zero delivery despite browser fee values', async () => {
  for (const mode of ['one_time', 'subscription']) {
    for (const browserFee of [0, 99999]) {
      let prepared;
      const q = { select() { return q; }, eq() { return q; }, update() { return q; },
        single: async () => ({ data: { customer_id: 'customer', glass_fee_cents: 0, tax_cents: 0, total_cents: 6000 }, error: null }),
        then: resolve => Promise.resolve({ error: null }).then(resolve),
      };
      const db = { from: () => q, rpc: async (_, params) => {
        prepared = params;
        return { data: { order_id: 'order', subtotal_cents: 6000, delivery_fee_cents: params.p_delivery_fee_cents }, error: null };
      } };
      const { POST } = load('src/app/api/checkout/route.ts', {
        '@/lib/account/payments': { createOrderCheckout: async () => 'https://checkout.example.test' },
        '@/app/auth/after-auth': {}, '@/lib/minimum-order': minimum,
        '@/lib/account/minimum-order': { assertSelectionMinimum: async () => {} },
        '@/lib/account/ordering-policy': { assertWeeklyOrderingOpen: async () => {} },
        '@/lib/sales-tax': tax, '@/lib/constants': constants,
        'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) } },
        '@/lib/supabase/server': { createAdminClient: () => db, createSessionClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) },
      });
      const uuid = '11111111-1111-4111-8111-111111111111';
      const result = await POST({ json: async () => ({ mode, checkoutPreparationId: uuid,
        subscriptionPlanId: mode === 'subscription' ? uuid : null,
        deliveryFeeCents: browserFee,
        customer: { name: 'Test Customer', email: 'test@example.test', address_line1: '12 Test Street', city: 'Durham', zip: '27701' },
        items: [{ mealId: uuid, mealSizeId: uuid, quantity: 6 }],
      }) });
      assert.equal(result.status, 200);
      assert.equal(prepared.p_delivery_fee_cents, 0);
      assert.equal(result.body.deliveryFeeCents, 0);
    }
  }
});

test('Stripe omits delivery for new free-delivery orders and preserves saved historical fees', async () => {
  for (const orderType of ['one_time', 'subscription']) {
  for (const delivery of [0, 1000]) {
    let sent;
    const subtotal = 6000, glass = 5000;
    const base = subtotal + glass + delivery;
    const taxCents = tax.orderTaxCents([subtotal, glass, delivery]);
    const order = { id: 'order', status: 'pending', order_type: orderType, subtotal_cents: subtotal,
      glass_fee_cents: glass, delivery_fee_cents: delivery, tax_rate_bps: 825, total_cents: base + taxCents };
    const db = { from(table) {
      const q = { select() { return q; }, eq() { return q; }, update() { return q; },
        single: async () => ({ data: table === 'orders' ? order : { email: 'test@example.test' }, error: null }),
        then: resolve => Promise.resolve({ error: null }).then(resolve),
      }; return q;
    } };
    const payments = load('src/lib/account/payments.ts', {
      'server-only': {}, './plan-prices': {}, '@/lib/minimum-order': minimum,
      '@/lib/sales-tax': tax, '@/lib/stripe-sales-tax': { ensureSalesTaxRate: async () => 'txr_test' },
      './ordering-policy': { assertWeeklyOrderingOpen: async () => {} },
      '@/lib/supabase/server': { createAdminClient: () => db },
      './server': { siteOrigin: () => 'https://example.test', stripeClient: () => ({ checkout: { sessions: { create: async input => {
        sent = input;
        return { id: 'session', url: 'https://checkout.example.test', expires_at: 1800000000,
          amount_subtotal: base, amount_total: base + taxCents, total_details: { amount_tax: taxCents } };
      } } } }) },
    });
    await payments.createOrderCheckout('order', 'customer');
    const line = sent.line_items.find(item => item.price_data.product_data.name === 'Delivery');
    assert.equal(Boolean(line), delivery > 0);
    if (line) assert.equal(line.price_data.unit_amount, delivery);
    assert.equal(sent.mode, orderType === 'subscription' ? 'subscription' : 'payment');
  }
  }
});

 test('holiday delivery still costs $10 and pickup remains free', () => {
  const { holidayQuote, HOLIDAY_DRAFT_SETTINGS } = load('src/lib/holiday-menu.ts', { './sales-tax': tax });
  assert.equal(constants.DELIVERY_FEE_CENTS, 1000);
  assert.equal(holidayQuote(HOLIDAY_DRAFT_SETTINGS, 18, false, true).deliveryCents, 1000);
  assert.equal(holidayQuote(HOLIDAY_DRAFT_SETTINGS, 18, false, false).deliveryCents, 0);
});
