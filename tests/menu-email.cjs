const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, console: { error() {} }, process: { env: { NEXT_PUBLIC_SITE_URL: 'https://example.com', RESEND_API_KEY: 'test-secret' } },
    URL, Intl, Date, Error, TypeError, AbortSignal, ...globals,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'crypto') return require('node:crypto');
      const target = name.startsWith('@/') ? `src/${name.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      return load(`${target}.ts`, mocks, globals, cache);
    },
  });
  return exports;
}

const menuId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
function meal(name = 'Test entrée', tags = ['main-dishes']) {
  return { id: name, name, tags, description: 'Prepared fresh.', is_active: true, is_available_for_one_time: true,
    is_available_for_subscription: true, meal_sizes: [
      { id: 'half', label: 'Half', servings: 2, price_cents: 2100, is_active: true, is_available_for_one_time: true, is_available_for_subscription: true },
      { id: 'whole', label: 'Whole', servings: 4, price_cents: 4200, is_active: true, is_available_for_one_time: true, is_available_for_subscription: false },
    ] };
}
const { buildMenuEmailPreview } = load('src/lib/email/menu-announcement.ts');

test('menu email uses saved portion prices, food categories and the Monday Eastern deadline', () => {
  const result = buildMenuEmailPreview('2026-11-02', false, [meal(), meal('Test side', ['sides'])], 'https://example.com');
  assert.equal(result.mealCount, 2);
  for (const text of ['Entrées', 'Sides', 'Half (serves 2): $21.00', 'Whole (serves 4): $42.00', 'November 2, 2026 at 8:00 p.m. Eastern', 'https://example.com/menu']) assert(result.text.includes(text), text);
  assert(result.html.includes('this menu is still a draft'));
  assert(result.html.includes('2161 South Wilmington St., Raleigh, NC 27603'));
  assert(result.html.includes('chefnetta@yoursouthernfoodie.com'));
  assert(result.html.includes('Customer announcements will include an unsubscribe link'));
});

test('email previews escape saved content and omit inactive or unavailable meals', () => {
  const dangerous = meal('<img src=x onerror=alert(1)>');
  const result = buildMenuEmailPreview('2026-11-02', true, [dangerous, { ...meal('Hidden'), is_active: false }, { ...meal('Unavailable'), meal_sizes: [] }], 'https://example.com');
  assert.equal(result.mealCount, 1);
  assert(!result.html.includes('<img src=x'));
  assert(result.html.includes('&lt;img'));
  assert(!result.html.includes('Hidden'));
  assert(!result.html.includes('this menu is still a draft'));
  assert.throws(() => buildMenuEmailPreview('2026-11-03', false, [meal()], 'https://example.com'), /Monday/);
  assert.throws(() => buildMenuEmailPreview('2026-02-30', false, [meal()], 'https://example.com'), /Monday/);
  assert.throws(() => buildMenuEmailPreview('2026-11-02', false, [], 'https://example.com'), /available meal/);
  assert.throws(() => buildMenuEmailPreview('2026-11-02', false, [meal()], 'javascript:alert(1)'), /URL|configured/);
});

function harness({ authorized = true, key = 'test-secret', verified = true, responseOk = true, networkFailure = false } = {}) {
  const fetches = [], reads = [];
  const admin = { userId, supabase: {
    auth: { admin: { getUserById: async (id) => {
      assert.equal(id, userId);
      return { data: { user: { email: 'admin@example.com', email_confirmed_at: verified ? '2026-01-01' : null } }, error: null };
    } } },
    from(table) {
      reads.push(table);
      assert.equal(table, 'weekly_menus');
      const q = { select() { return q; }, eq(column, value) { assert.equal(column, 'id'); assert.equal(value, menuId); return q; },
        async maybeSingle() { return { data: { week_start: '2026-11-02', is_published: false, weekly_menu_items: [{ sold_out: false, meals: meal() }, { sold_out: true, meals: meal('Sold out') }] }, error: null }; } };
      return q;
    },
  } };
  const actions = load('src/app/admin/menus/email-actions.ts', {
    '@/lib/auth/require-admin': { requireAdminContext: async () => { if (!authorized) throw Error('Not authorized'); return admin; } },
  }, {
    process: { env: { RESEND_API_KEY: key, NEXT_PUBLIC_SITE_URL: 'https://example.com' } },
    fetch: async (url, options) => { fetches.push({ url, options }); if (networkFailure) throw new TypeError('Network failed'); return { ok: responseOk, status: responseOk ? 200 : 403, json: async () => ({ id: 'test-message' }) }; },
  });
  return { actions, fetches, reads };
}

test('unauthorized users cannot read previews or trigger email requests', async () => {
  const h = harness({ authorized: false });
  assert.match((await h.actions.previewMenuEmail(menuId)).error, /authorized/);
  assert.equal((await h.actions.sendMenuTestEmail(menuId, requestId)).sent, false);
  assert.equal(h.reads.length, 0);
  assert.equal(h.fetches.length, 0);
});

test('preview reads the real menu without sending or publishing and omits sold-out dishes', async () => {
  const h = harness();
  const result = await h.actions.previewMenuEmail(menuId);
  assert.equal(result.preview.mealCount, 1);
  assert(!result.preview.html.includes('Sold out'));
  assert.equal(h.fetches.length, 0);
  assert.equal(h.reads.length, 1);
});

test('test emails target only the verified administrator with stable retry keys and approved sender details', async () => {
  const h = harness();
  assert.equal((await h.actions.sendMenuTestEmail(menuId, requestId)).sent, true);
  await h.actions.sendMenuTestEmail(menuId, requestId);
  assert.equal(h.fetches.length, 2);
  const first = h.fetches[0], payload = JSON.parse(first.options.body);
  assert.equal(first.url, 'https://api.resend.com/emails');
  assert.deepEqual(payload.to, ['admin@example.com']);
  assert.equal(payload.from, 'Chef Netta <chefnetta@yoursouthernfoodie.com>');
  assert.equal(payload.reply_to, 'chefnetta@yoursouthernfoodie.com');
  assert(payload.subject.startsWith('[TEST]'));
  assert.equal(first.options.headers['Idempotency-Key'], h.fetches[1].options.headers['Idempotency-Key']);
  assert(first.options.headers['Idempotency-Key'].includes(userId));
});

test('invalid inputs, missing keys, and unverified administrator emails cannot send', async () => {
  for (const options of [{ key: '' }, { verified: false }]) {
    const h = harness(options);
    assert.equal((await h.actions.sendMenuTestEmail(menuId, requestId)).sent, false);
    assert.equal(h.fetches.length, 0);
  }
  const h = harness();
  assert((await h.actions.previewMenuEmail('invalid')).error);
  assert.equal((await h.actions.sendMenuTestEmail(menuId, 'invalid')).sent, false);
  assert.equal(h.fetches.length, 0);
  assert.equal(h.reads.length, 0);
});

test('provider rejections and ambiguous network failures are surfaced without claiming delivery', async () => {
  for (const options of [{ responseOk: false }, { networkFailure: true }]) {
    const h = harness(options);
    const result = await h.actions.sendMenuTestEmail(menuId, requestId);
    assert.equal(result.sent, false);
    assert(result.error);
    assert(!result.error.includes('test-secret'));
  }
});
