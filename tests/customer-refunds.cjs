const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
function scenario({
  paid = true,
  oldTotal = 10000,
  newTotal = 6000,
  failFinalizeOnce = false,
  session = null,
} = {}) {
  const refunds = [];
  let refundCalls = 0,
    finalizeCalls = 0;
  const change = {
    id: 'change-1',
    status: 'pending',
    paid,
    old_total_cents: oldTotal,
    new_total_cents: newTotal,
    operation: newTotal === 0 ? 'cancel' : 'edit',
    orders: { id: 'order-1', stripe_payment_intent_id: 'pi_test', delivery_fee_cents: 0 },
    payload: { deposit_cents: 0 },
    stripe_checkout_session_id: session,
  };
  const stripe = {
    refunds: {
      list: async () => ({ data: refunds }),
      create: async (args) => {
        refundCalls++;
        const refund = {
          id: 're_test',
          amount: args.amount,
          status: 'succeeded',
          metadata: args.metadata,
        };
        refunds.push(refund);
        return refund;
      },
    },
    paymentIntents: {
      retrieve: async () => ({
        latest_charge: {
          amount: oldTotal,
          amount_refunded: refunds.reduce((sum, r) => sum + r.amount, 0),
        },
      }),
    },
    checkout: {
      sessions: {
        retrieve: async () => ({ status: 'complete' }),
        create: async () => {
          throw new Error('Unexpected new checkout');
        },
      },
    },
  };
  const admin = {
    from() {
      let selected = '*',
        row;
      const q = {
        select(value) {
          selected = value;
          return q;
        },
        eq() {
          return q;
        },
        single: async () => ({ data: change, error: null }),
        update(value) {
          row = value;
          return q;
        },
        then(resolve) {
          if (row) Object.assign(change, row);
          return Promise.resolve({
            data: selected === 'stripe_checkout_session_id' ? [] : null,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
    rpc: async () => {
      finalizeCalls++;
      if (failFinalizeOnce && finalizeCalls === 1)
        return { error: new Error('Temporary database failure') };
      change.status = 'applied';
      return { error: null };
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, '../src/lib/account/payments.ts'),
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
      exports,
      require(name) {
        if (name === 'server-only') return {};
        if (name === '@/lib/minimum-order') { const minimum = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/minimum-order.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: minimum, Error, Number }); return minimum; }
        if (name.includes('supabase/server'))
          return { createAdminClient: () => admin };
        if (name === './server')
          return {
            stripeClient: () => stripe,
            siteOrigin: () => 'https://example.test',
          };
        return {};
      },
      Date,
    },
  );
  return {
    settle: () => exports.settleOrderChange(change.id),
    counts: () => ({ refundCalls, finalizeCalls }),
    change,
  };
}
test('refund retries do not refund twice after a database failure', async () => {
  const s = scenario({ failFinalizeOnce: true });
  await assert.rejects(s.settle(), /Temporary database/);
  assert.equal(s.change.status, 'pending');
  await s.settle();
  assert.equal(s.change.status, 'applied');
  assert.equal(s.counts().refundCalls, 1);
});
test('canceling a paid order refunds before finalizing cancellation', async () => {
  const s = scenario({ newTotal: 0 });
  const result = await s.settle();
  assert.match(result.message, /canceled/);
  assert.equal(s.counts().refundCalls, 1);
  assert.equal(s.counts().finalizeCalls, 1);
});
test('unpaid changes do not create refunds', async () => {
  const s = scenario({ paid: false });
  await s.settle();
  assert.equal(s.counts().refundCalls, 0);
  assert.equal(s.counts().finalizeCalls, 1);
});
test('extra payment is not applied until its webhook confirms it', async () => {
  const s = scenario({ newTotal: 15000, session: 'cs_test' });
  const result = await s.settle();
  assert.match(result.message, /processing/);
  assert.equal(s.counts().finalizeCalls, 0);
});

test('discarded changes cannot trigger another refund or payment', async () => {
  const s = scenario();
  s.change.status = 'failed';
  await assert.rejects(s.settle(), /no longer available/);
  assert.equal(s.counts().refundCalls, 0);
  assert.equal(s.counts().finalizeCalls, 0);
});

test('an edit below the food minimum cannot trigger a payment or refund', async () => {
  const s = scenario({ newTotal: 5499 });
  await assert.rejects(s.settle(), /minimum food order/);
  assert.equal(s.counts().refundCalls, 0);
  assert.equal(s.counts().finalizeCalls, 0);
});
