const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
function scenario({ foreign = false, missing = false } = {}) {
  const updates = [],
    filters = [];
  const customer = { id: 'customer-own', stripe_customer_id: 'cus_own' };
  const local = {
    id: 'sub_local',
    status: 'active',
    stripe_subscription_id: 'sub_remote',
  };
  const remote = {
    id: 'sub_remote',
    customer: foreign ? 'cus_other' : 'cus_own',
    metadata: {},
    current_period_end: 1800000000,
    items: {
      data: [
        {
          id: 'si_current',
          price: { recurring: { interval: 'week', interval_count: 1 } },
        },
      ],
    },
  };
  const plan = {
    id: 'plan_six',
    name: '6 meals per week',
    code: 'weekly-6',
    included_credits: 6,
    price_cents: 8100,
    billing_interval: 'week',
    billing_interval_count: 1,
  };
  const admin = {
    from(table) {
      let row;
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push([table, key, value]);
          return q;
        },
        single: async () => ({
          data: missing ? null : local,
          error: missing ? { message: 'Not found' } : null,
        }),
        update(value) {
          row = value;
          return q;
        },
        then(resolve) {
          if (row) updates.push(['database', row]);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const stripe = {
    subscriptions: {
      retrieve: async () => remote,
      update: async (id, params) => {
        updates.push(['stripe', params]);
        return remote;
      },
    },
  };
  const e = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, '../src/app/account/actions.ts'),
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
      exports: e,
      require(name) {
        if (name === 'next/cache') return { revalidatePath() {} };
        if (name.includes('account/server'))
          return {
            accountContext: async () => ({
              user: { id: 'user-own' },
              customer,
              admin,
            }),
            stripeClient: () => stripe,
          };
        if (name.includes('plan-prices'))
          return {
            ensurePlanPrice: async () => ({ plan, priceId: 'price_new' }),
          };
        return {};
      },
      Error,
      Date,
      FormData,
    },
  );
  function form(operation) {
    const f = new FormData();
    f.set('subscription_id', 'sub_local');
    f.set('operation', operation);
    f.set('plan_id', 'plan_six');
    return f;
  }
  return {
    run: (operation) => e.manageSubscription(form(operation)),
    updates,
    filters,
  };
}
test('subscription mutations require both account ownership and matching Stripe identity', async () => {
  const s = scenario({ foreign: true });
  const r = await s.run('pause');
  assert.match(r.error, /ownership/);
  assert.equal(s.updates.length, 0);
  assert.ok(
    s.filters.some(
      ([table, key, value]) =>
        table === 'subscriptions' &&
        key === 'customer_id' &&
        value === 'customer-own',
    ),
  );
});
test('missing subscription is not sent to Stripe', async () => {
  const s = scenario({ missing: true });
  assert.ok((await s.run('cancel')).error);
  assert.equal(s.updates.length, 0);
});
test('skipping next week voids one future weekly billing cycle and records resumption', async () => {
  const s = scenario();
  assert.ok((await s.run('skip')).message);
  const params = s.updates.find(([kind]) => kind === 'stripe')[1];
  assert.equal(params.pause_collection.behavior, 'void');
  assert.equal(params.pause_collection.resumes_at, 1800000000 + 7 * 86400);
});
test('subscription cancellation preserves the current billing period', async () => {
  const s = scenario();
  await s.run('cancel');
  assert.equal(
    s.updates.find(([kind]) => kind === 'stripe')[1].cancel_at_period_end,
    true,
  );
});
test('plan changes replace the existing price without immediate proration', async () => {
  const s = scenario();
  await s.run('plan');
  const params = s.updates.find(([kind]) => kind === 'stripe')[1];
  assert.equal(params.proration_behavior, 'none');
  assert.equal(params.items[0].id, 'si_current');
  assert.equal(params.items[0].price, 'price_new');
  assert.equal(params.items[0].quantity, 1);
  assert.equal(
    s.updates.find(([kind]) => kind === 'database')[1]
      .included_credits_snapshot,
    6,
  );
});
