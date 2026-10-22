const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
const policy = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/lib/account/policy.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports: policy, Date },
);
const created = '2026-10-11T12:00:00Z',
  start = Date.parse(created),
  order = { created_at: created, status: 'paid' };
test('cancellation closes at exactly 24 hours', () => {
  assert.equal(policy.canCancelOrder(order, start + 24 * 3600000 - 1), true);
  assert.equal(policy.canCancelOrder(order, start + 24 * 3600000), false);
  assert.equal(policy.canCancelOrder(order, start + 25 * 3600000), false);
});
test('fulfilled and canceled orders cannot be changed', () => {
  for (const status of ['delivered', 'out_for_delivery', 'canceled'])
    assert.equal(policy.canCancelOrder({ ...order, status }, start + 1), false);
});
test('preparation locks edits but the 24-hour cancellation window is retained', () => {
  assert.equal(
    policy.canEditOrder({ ...order, status: 'packing' }, start + 1),
    false,
  );
  assert.equal(
    policy.canCancelOrder({ ...order, status: 'packing' }, start + 1),
    true,
  );
});
test('malformed and future timestamps cannot enable changes', () => {
  assert.equal(
    policy.canCancelOrder({ ...order, created_at: 'bad' }, start),
    false,
  );
  assert.equal(policy.canCancelOrder(order, start - 1), false);
});

const auth = {};
let mutations = [];
const authClient = {
  from(table) {
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      update(value) {
        mutations.push({ table, value });
        return q;
      },
      then(resolve) {
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
      maybeSingle: async () => ({
        data: table === 'profiles' ? { role: 'customer' } : { id: 'customer' },
        error: null,
      }),
    };
    return q;
  },
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/app/auth/after-auth.ts'),
      'utf8',
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: auth,
    require: () => ({ createAdminClient: () => authClient }),
    process: { env: { ADMIN_EMAILS: 'chef@example.test' } },
    String,
    Error,
  },
);
test('unverified emails cannot claim guest history or become admins', async () => {
  await assert.rejects(
    auth.afterAuth({
      id: 'user',
      email: 'chef@example.test',
      email_confirmed_at: null,
    }),
    /verified email/,
  );
  assert.equal(mutations.length, 0);
});
test('user-controlled metadata does not confer admin privileges', async () => {
  assert.equal(
    await auth.afterAuth({
      id: 'user',
      email: 'customer@example.test',
      email_confirmed_at: created,
      user_metadata: { role: 'admin' },
    }),
    'customer',
  );
  assert.equal(mutations.length, 0);
});
test('redirects reject external hosts, backslashes and control characters', () => {
  for (const value of [
    'https://example.test',
    '//example.test',
    '/\\example.test',
    '/account\n',
  ])
    assert.equal(auth.safeRedirect(value, '/account'), '/account');
  assert.equal(auth.safeRedirect('/checkout', '/account'), '/checkout');
});
