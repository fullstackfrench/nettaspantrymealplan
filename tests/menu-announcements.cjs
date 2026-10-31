const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
function load(file, mocks, globals, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, TypeError, Buffer, URL, Date, Intl, AbortSignal, setTimeout: (callback) => { callback(); }, ...globals,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'crypto') return require('node:crypto');
      const target = name.startsWith('@/') ? `src/${name.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
      return load(`${target}.ts`, mocks, globals, cache);
    },
  }); return exports;
}
const menuId = '20000000-0000-4000-8000-000000000001', actor = '10000000-0000-4000-8000-000000000001';
const announcementId = '60000000-0000-4000-8000-000000000001', attemptId = '60000000-0000-4000-8000-000000000002', broadcastId = '60000000-0000-4000-8000-000000000003';
const meal = { id: 'meal', name: 'Synthetic entrée', description: 'Prepared fresh.', tags: ['main-dishes'], is_active: true, is_available_for_one_time: true, is_available_for_subscription: true, meal_sizes: [{ id: 'size', label: 'Half', servings: 2, price_cents: 2100, is_active: true, is_available_for_one_time: true, is_available_for_subscription: true }] };
function harness(options = {}) {
  const state = { context: { snapshot: { week_start: '2099-01-05', items: [{ id: 'item', sold_out: false, meal: structuredClone(meal) }] }, published: false, closes_at: '2099-01-06T01:00:00Z', latest_published_week: null, announcement: null }, calls: [], writes: [], reservations: 0, refreshes: [], list: [{ id: '1', email: 'real@example.com', unsubscribed: false }, { id: '2', email: 'unsub@example.com', unsubscribed: true }, { id: '3', email: 'bounced@example.com', unsubscribed: false }], suppressions: [{ id: 's', email: 'bounced@example.com' }] };
  const admin = { userId: actor, supabase: {
    async rpc(name, args) {
      state.calls.push({ rpc: name });
      if (name === 'menu_announcement_context') return { data: structuredClone(state.context), error: null };
      if (name === 'reserve_menu_announcement') {
        state.reservations++;
        if (state.context.announcement) return { data: { claimed: false, ...state.context.announcement }, error: null };
        state.context.published = true;
        state.context.announcement = { id: announcementId, status: 'preparing', stage: 'create', broadcast_id: null, recipient_count: args.p_recipient_count, last_error: null };
        return { data: { claimed: true, id: announcementId, attempt_id: attemptId, status: 'preparing', broadcast_id: null }, error: null };
      }
      if (name === 'begin_menu_announcement_send') { state.context.announcement.status = 'sending'; state.context.announcement.stage = 'send'; return { data: true, error: null }; }
      throw Error('Unexpected RPC');
    },
    from(table) {
      assert.equal(table, 'menu_announcements'); let values;
      const q = { update(v) { values = v; return q; }, eq() { return q; }, select() { return q; },
        async single() { state.writes.push(values); Object.assign(state.context.announcement, values); return { data: { id: announcementId }, error: null }; },
        then(resolve) { state.writes.push(values); Object.assign(state.context.announcement, values); return Promise.resolve({ error: null }).then(resolve); } };
      return q;
    },
  } };
  const mocks = { 'next/cache': { revalidatePath: (p) => state.refreshes.push(p) }, '@/lib/auth/require-admin': { requireAdminContext: async () => { if (options.unauthorized) throw Error('Not authorized'); return admin; } } };
  class Clock extends Date { static now() { return state.now ?? Date.now(); } }
  const globals = { Date: Clock, process: { env: { RESEND_API_KEY: 'test-secret', NEXT_PUBLIC_SITE_URL: 'https://example.com' } }, fetch: async (url, init = {}) => {
    const p = new URL(url).pathname;
    state.calls.push({ path: p, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (p === '/contacts') return { ok: true, json: async () => ({ data: structuredClone(state.list), has_more: false }) };
    if (p === '/suppressions') return { ok: true, json: async () => ({ data: state.suppressions, has_more: false }) };
    if (p === '/broadcasts') {
      assert(state.calls.at(-1).body.name.length <= 70, 'Resend broadcast names must fit its 70-character limit');
      if (options.createTimeout) throw new TypeError('Network timeout after possible creation');
      if (options.rejectCreate) return { ok: false, status: 403 };
      return { ok: true, json: async () => ({ id: broadcastId }) };
    }
    if (p.endsWith('/send')) {
      if (options.sendTimeout) throw new TypeError('Network timeout after possible send');
      return { ok: true, json: async () => ({ id: broadcastId }) };
    }
    if (p === `/broadcasts/${broadcastId}`) return { ok: true, json: async () => ({ status: 'sent' }) };
    throw Error('Unexpected provider request '+p);
  } };
  return { state, admin, actions: load('src/app/admin/menus/announcement-actions.ts', mocks, globals) };
}

test('review counts only subscribed, unsuppressed contacts and creates no broadcast', async () => {
  const h = harness(), result = await h.actions.reviewMenuAnnouncement(menuId);
  assert.equal(result.review.recipientCount, 1);
  assert(result.review.token);
  assert(result.review.preview.html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));
  assert(!result.review.preview.html.includes('Test email only'));
  assert(!result.review.preview.text.includes('administrator test'));
  assert.equal(h.state.reservations, 0);
  assert.equal(h.state.calls.filter(c => c.method === 'POST').length, 0);
  assert.equal(h.state.context.published, false);
});

test('authorization, explicit approval, signed tokens, and current deadlines are enforced before a broadcast can be created', async () => {
  const unauthorized = harness({ unauthorized: true });
  assert.match((await unauthorized.actions.reviewMenuAnnouncement(menuId)).error, /authorized/);
  assert((await unauthorized.actions.publishAndNotify(menuId, 'fake', true)).error);
  assert.equal(unauthorized.state.calls.length, 0);
  const h = harness(), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
  assert((await h.actions.publishAndNotify(menuId, review.token, false)).error);
  assert((await h.actions.publishAndNotify(menuId, review.token+'bad', true)).error);
  h.state.context.closes_at = '2000-01-01T00:00:00Z';
  assert.match((await h.actions.publishAndNotify(menuId, review.token, true)).error, /closed/);
  assert.equal(h.state.reservations, 0);
});

test('changed dishes or recipients invalidate a reviewed confirmation', async () => {
  for (const kind of ['menu', 'audience']) {
    const h = harness(), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
    if (kind === 'menu') h.state.context.snapshot.items[0].meal.name = 'Changed';
    else h.state.list.push({ id: '4', email: 'another@example.com', unsubscribed: false });
    const result = await h.actions.publishAndNotify(menuId, review.token, true);
    assert.match(result.error, /changed/);
    assert.equal(h.state.reservations, 0);
  }
});

test('confirmed sends publish once, save a draft before sending, and use the approved marketing segment', async () => {
  const h = harness(), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
  const result = await h.actions.publishAndNotify(menuId, review.token, true);
  assert.equal(result.queued, true);
  assert.equal(h.state.context.published, true);
  assert.equal(h.state.context.announcement.status, 'queued');
  const create = h.state.calls.find(c => c.path === '/broadcasts');
  assert.equal(create.body.send, false);
  assert.equal(create.body.name, `netta-menu-2099-01-05-${announcementId}`);
  assert(create.body.name.length <= 70);
  assert.equal(create.body.segment_id, 'aa952e1a-0da7-4c8d-9455-041df327a843');
  assert(create.body.html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));
  assert(!create.body.subject.includes('[TEST]'));
  const beginIndex = h.state.calls.findIndex(c => c.rpc === 'begin_menu_announcement_send');
  const sendIndex = h.state.calls.findIndex(c => c.path?.endsWith('/send'));
  assert(beginIndex > 0 && sendIndex > beginIndex);
  assert(h.state.writes.some(w => w.status === 'draft' && w.broadcast_id === broadcastId));
  await h.actions.publishAndNotify(menuId, review.token, true);
  assert.equal(h.state.calls.filter(c => c.path === '/broadcasts').length, 1);
  assert.equal(h.state.calls.filter(c => c.path?.endsWith('/send')).length, 1);
  assert(h.state.refreshes.includes('/menu'));
});

test('concurrent confirmations reserve only one announcement', async () => {
  const h = harness(), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
  await Promise.all([h.actions.publishAndNotify(menuId, review.token, true), h.actions.publishAndNotify(menuId, review.token, true)]);
  assert.equal(h.state.calls.filter(c => c.path === '/broadcasts').length, 1);
  assert.equal(h.state.calls.filter(c => c.path?.endsWith('/send')).length, 1);
});

test('uncertain creation or sends never automatically create or send another broadcast', async () => {
  for (const options of [{ createTimeout: true }, { sendTimeout: true }]) {
    const h = harness(options), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
    assert((await h.actions.publishAndNotify(menuId, review.token, true)).error);
    assert.equal(h.state.context.announcement.status, 'needs_review');
    await h.actions.publishAndNotify(menuId, review.token, true);
    assert.equal(h.state.calls.filter(c => c.path === '/broadcasts').length, 1);
    assert.equal(h.state.calls.filter(c => c.path?.endsWith('/send')).length, options.sendTimeout ? 1 : 0);
    if (options.sendTimeout) {
      const status = await h.actions.checkMenuAnnouncement(menuId);
      assert.equal(status.queued, true);
      assert.equal(h.state.calls.filter(c => c.path?.endsWith('/send')).length, 1);
    }
  }
});

test('a definite rejected draft creation can be reviewed for a safe retry', async () => {
  const h = harness({ rejectCreate: true }), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
  assert((await h.actions.publishAndNotify(menuId, review.token, true)).error);
  assert.equal(h.state.context.announcement.status, 'failed');
  assert.equal(h.state.context.announcement.stage, 'create');
  assert.equal(h.state.calls.filter(c => c.path?.endsWith('/send')).length, 0);
  const retry = await h.actions.reviewMenuAnnouncement(menuId);
  assert(retry.review.token);
});


test('confirmation expires and cannot be reused by a different administrator or for a superseded menu', async () => {
  for (const kind of ['expired', 'actor', 'newer']) {
    const h = harness(), review = (await h.actions.reviewMenuAnnouncement(menuId)).review;
    if (kind === 'expired') h.state.now = Date.now() + 16 * 60000;
    if (kind === 'actor') h.admin.userId = '10000000-0000-4000-8000-000000000002';
    if (kind === 'newer') h.state.context.latest_published_week = '2099-01-12';
    const result = await h.actions.publishAndNotify(menuId, review.token, true);
    assert(result.error);
    assert.equal(h.state.reservations, 0);
    assert.equal(h.state.calls.filter(c => c.method === 'POST').length, 0);
  }
});
