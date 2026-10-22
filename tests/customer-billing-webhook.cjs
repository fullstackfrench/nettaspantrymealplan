const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
let event,
  processed = new Set(),
  applied = [];
const change = {
  id: 'change-1',
  stripe_checkout_session_id: 'cs_expected',
  old_total_cents: 2000,
  new_total_cents: 3000,
};
const admin = {
  from(table) {
    let values, filterId;
    const q = {
      select() {
        return q;
      },
      eq(key, value) {
        if (key === 'stripe_event_id') filterId = value;
        return q;
      },
      upsert(row) {
        values = row;
        filterId = row.stripe_event_id;
        return q;
      },
      update(row) {
        values = row;
        return q;
      },
      single: async () => ({ data: change, error: null }),
      maybeSingle: async () => ({
        data: processed.has(filterId)
          ? { processing_status: 'processed' }
          : null,
        error: null,
      }),
      then(resolve) {
        if (values?.processing_status === 'processed') processed.add(filterId);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return q;
  },
  rpc: async (name, args) => {
    applied.push({ name, args });
    return { data: null, error: null };
  },
};
const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      path.join(__dirname, '../src/app/api/stripe/webhook/route.ts'),
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
    exports: exportsObject,
    require(name) {
      if (name === 'next/server')
        return {
          NextResponse: {
            json: (data, options) =>
              new Response(JSON.stringify(data), options),
          },
        };
      if (name === 'next/cache') return { revalidatePath() {} };
      if (name.includes('supabase/server'))
        return { createAdminClient: () => admin };
      if (name.includes('account/server'))
        return {
          stripeClient: () => ({
            webhooks: {
              constructEvent(_body, signature) {
                if (signature === 'bad') throw new Error('Invalid signature');
                return event;
              },
            },
          }),
        };
      return {};
    },
    process: { env: { STRIPE_WEBHOOK_SECRET: 'test-secret' } },
    console: { error() {} },
    Date,
  },
);
function request(signature = 'valid') {
  return new Request('https://example.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: 'event',
  });
}
function session(amount, sessionId = 'cs_expected') {
  return {
    type: 'checkout.session.completed',
    id: 'evt_' + amount + '_' + sessionId,
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        currency: 'usd',
        amount_total: amount,
        metadata: { order_change_id: 'change-1' },
      },
    },
  };
}
test('unsigned webhook cannot mutate orders', async () => {
  applied = [];
  assert.equal((await exportsObject.POST(request('bad'))).status, 400);
  assert.equal(applied.length, 0);
});
test('adjustment amount and session must match the reserved change', async () => {
  applied = [];
  event = session(999);
  assert.equal((await exportsObject.POST(request())).status, 500);
  event = session(1000, 'cs_wrong');
  assert.equal((await exportsObject.POST(request())).status, 500);
  assert.equal(applied.length, 0);
});
test('paid adjustment applies once despite duplicate webhook delivery', async () => {
  applied = [];
  event = session(1000);
  assert.equal((await exportsObject.POST(request())).status, 200);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].name, 'finish_customer_order_change');
  assert.equal((await exportsObject.POST(request())).status, 200);
  assert.equal(applied.length, 1);
});
