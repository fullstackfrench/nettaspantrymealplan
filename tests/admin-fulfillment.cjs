const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function scenario({ authorized = true, sessionStatus = null, payment = 'unpaid', legacySession = false, rpcError = null } = {}) {
  const calls = [];
  const row = { status: 'pending', payment_status: payment, stripe_checkout_session_id: sessionStatus && !legacySession ? 'cs_test' : null, stripe_payment_intent_id: legacySession ? 'cs_test' : null };
  const db = { from() {
    const q = { select: () => q, eq: () => q, single: async () => ({ data: row, error: null }) }; return q;
  }, rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: { changed: true }, error: rpcError }; } };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/admin/fulfillment.ts','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Error, require(name) {
    if (name === 'server-only') return {};
    if (name === 'next/cache') return { revalidatePath: p => calls.push(['refresh', p]) };
    if (name === '@/lib/auth/require-admin') return { requireAdminContext: async () => {
      if (!authorized) throw Error('Unauthorized'); return { supabase: db, userId: 'verified-admin' };
    } };
    if (name === '@/lib/account/server') return { stripeClient: () => ({ checkout: { sessions: {
      retrieve: async () => ({ id: 'cs_test', status: sessionStatus }),
      expire: async id => calls.push(['expire', id]),
    } } }) };
    throw Error(name);
  } });
  return { transition: exports.transitionAdminFulfillment, calls };
}
const id = '11111111-1111-4111-8111-111111111111';
test('fulfillment authorization rejects unauthorized callers before reaching the database', async () => {
  const f = scenario({ authorized: false });
  await assert.rejects(f.transition(id, 'packed'), /Unauthorized/);
  assert.equal(f.calls.length, 0);
});
test('only Packed, Delivered, and separate cancellation actions are accepted', async () => {
  const f = scenario();
  for (const status of ['paid', 'packing', 'out_for_delivery', 'unfulfilled']) await assert.rejects(f.transition(id,status), /Invalid fulfillment/);
  assert.equal(f.calls.length, 0);
});
test('the RPC receives the server-verified administrator identity and order kind', async () => {
  const f = scenario(); await f.transition(id, 'packed', 'holiday');
  const call = f.calls.find(c => c[0] === 'rpc');
  assert.equal(call[1], 'transition_order_fulfillment');
  assert.equal(call[2].p_actor_id, 'verified-admin');
  assert.equal(call[2].p_order_id, id);
  assert.equal(call[2].p_kind, 'holiday');
});
test('unpaid cancellation expires checkout before changing the database', async () => {
  for (const legacySession of [false, true]) {
    const f = scenario({ sessionStatus: 'open', legacySession }); await f.transition(id, 'canceled');
    assert.equal(f.calls[0][0], 'expire'); assert.equal(f.calls[1][0], 'rpc');
  }
});
test('paid, processing, and just-completed payments cannot bypass the refund workflow', async () => {
  for (const payment of ['paid', 'partially_refunded', 'processing']) {
    const f = scenario({ payment }); await assert.rejects(f.transition(id, 'canceled'), /refund process/);
    assert(!f.calls.some(c => c[0] === 'rpc'));
  }
  const f = scenario({ sessionStatus: 'complete' });
  await assert.rejects(f.transition(id, 'canceled'), /Payment is processing/);
  assert(!f.calls.some(c => c[0] === 'rpc'));
});
test('database transition failures are surfaced and do not report success', async () => {
  const f = scenario({ rpcError: { code: 'P0001', message: 'Only paid, packed orders can be marked delivered.' } });
  await assert.rejects(f.transition(id, 'delivered'), /Only paid, packed/);
  assert(!f.calls.some(c => c[0] === 'refresh'));
  await assert.rejects(scenario({ rpcError: { code: 'PGRST202' } }).transition(id, 'packed'), /not enabled yet/);
});
