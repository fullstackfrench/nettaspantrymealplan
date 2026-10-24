const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => load(path.resolve(path.dirname(file), name + '.ts')) });
  return exports;
}
const { getSubscriptionKind, subscriptionMix } = load(path.resolve('src/lib/subscription-mix.ts'));
test('subscription categories include breakfast, soup, salad and main dishes as entrees', () => {
  for (const category of ['breakfast', 'soups', 'salads-bowls', 'main-dishes']) {
    assert.equal(getSubscriptionKind({ name: 'Dish', tags: [category] }), 'entree');
  }
  assert.equal(getSubscriptionKind({ name: 'Dish', tags: ['sides'] }), 'side');
  assert.equal(getSubscriptionKind({ name: 'Dish', tags: ['desserts'] }), null);
  assert.equal(getSubscriptionKind({ name: 'Chicken', tags: ['uncategorized'] }), null);
});
test('legacy meals follow the same category suggestions as the meal editor', () => {
  assert.equal(getSubscriptionKind({ name: 'Honey Ginger Roasted Carrots', tags: [] }), 'side');
  assert.equal(getSubscriptionKind({ name: 'Chicken Soup', tags: [] }), 'entree');
  assert.equal(getSubscriptionKind({ name: 'Chia Pudding', tags: [] }), null);
  assert.equal(getSubscriptionKind({ name: 'Roasted Carrots', tags: ['main-dishes'] }), 'entree');
});
test('every tier requires equal quantities of sides and entrees', () => {
  for (const required of [6, 8, 12]) {
    assert.equal(subscriptionMix([{ kind: 'side', quantity: required / 2 }, { kind: 'entree', quantity: required / 2 }], required).valid, true);
    assert.equal(subscriptionMix([{ kind: 'side', quantity: required / 2 - 1 }, { kind: 'entree', quantity: required / 2 + 1 }], required).valid, false);
    assert.equal(subscriptionMix([{ kind: 'entree', quantity: required }], required).valid, false);
  }
});
test('invalid quantities, unknown dishes and incomplete or odd plans cannot qualify', () => {
  for (const quantity of [0, -1, 2.5, NaN]) {
    assert.equal(subscriptionMix([{ kind: 'side', quantity }, { kind: 'entree', quantity: 3 }], 6).valid, false);
  }
  assert.equal(subscriptionMix([{ kind: 'side', quantity: 3 }, { kind: 'entree', quantity: 3 }, { kind: null, quantity: 1 }], 6).valid, false);
  assert.equal(subscriptionMix([], 0).valid, false);
  assert.equal(subscriptionMix([{ kind: 'side', quantity: 2 }, { kind: 'entree', quantity: 3 }], 5).valid, false);
});
function cartHarness() {
  const values = []; let cursor = 0; let effectCursor = 0; let context; const effects = new Set();
  const react = {
    createContext() { context = { Provider: Symbol('provider') }; return context; },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = initial;
      return [values[slot], (update) => { values[slot] = typeof update === 'function' ? update(values[slot]) : update; }];
    },
    useEffect(fn) { const id = effectCursor++; if (!effects.has(id)) { effects.add(id); fn(); } },
    useMemo(fn) { return fn(); },
    useContext() { return context.value; },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cart.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, window: { confirm: () => true, addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} }, fetch: async () => ({ ok: true, json: async () => ({ orderingOpen: true, closesAt: '2099-01-06T01:00:00Z', glassFeeCents: 5000 }) }), require(name) {
    if (name === 'react') return react;
    if (name === 'next/navigation') return { usePathname: () => '/menu' };
    if (name === 'react/jsx-runtime') return { jsx: (type, props) => { context.value = props.value; return null; } };
    if (name === './constants') return { GLASS_CONTAINER_DEPOSIT_CENTS: 5000 };
    if (name === './subscription-mix') return { getSubscriptionKind, subscriptionMix };
    throw new Error(name);
  } });
  return () => { cursor = 0; effectCursor = 0; exports.CartProvider({ children: null }); return exports.useCart(); };
}
const meal = (id, category) => ({ id, name: id, slug: id, tags: [category], is_available_for_subscription: true, is_available_for_one_time: true });
const size = { id: 'regular', label: 'Regular', servings: 1, price_cents: 1200, is_active: true, is_available_for_subscription: true, is_available_for_one_time: true };
const plan = { id: 'six', code: 'weekly-6', name: 'Six', included_credits: 6, price_cents: 8100, billing_interval: 'week', billing_interval_count: 1 };
test('cart caps each category even for repeated additions before React renders', async () => {
  const render = cartHarness(); render(); await new Promise(setImmediate); render().selectPlan(plan);
  const side = meal('carrots', 'sides'), entree = meal('soup', 'soups');
  let cart = render();
  for (let i = 0; i < 7; i++) cart.addSubscription(side, size);
  cart = render();
  assert.equal(cart.subscriptionSides, 3);
  assert.equal(cart.canAddSubscription(side), false);
  assert.equal(cart.canAddSubscription(entree), true);
  assert.equal(cart.subscriptionComplete, false);
  for (let i = 0; i < 7; i++) cart.addSubscription(entree, size);
  cart = render();
  assert.equal(cart.totalMeals, 6);
  assert.equal(cart.subscriptionComplete, true);
  cart.remove(cart.lines[0].id);
  cart = render();
  assert.equal(cart.subscriptionComplete, false);
  assert.equal(cart.canAddSubscription(side), true);
});
test('subscription desserts are rejected and one-time orders have no category cap', async () => {
  const render = cartHarness(); render(); await new Promise(setImmediate); render().selectPlan(plan);
  render().addSubscription(meal('pudding', 'desserts'), size);
  assert.equal(render().totalMeals, 0);
  render().changeMode('one_time');
  const cart = render();
  for (let i = 0; i < 7; i++) cart.addOneTime(meal('pudding', 'desserts'), size);
  assert.equal(render().totalMeals, 7);
  assert.equal(render().subtotalCents, 8400);
});
