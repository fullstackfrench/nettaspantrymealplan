const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}, environment = {}) {
  const output = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      exports: output,
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        throw new Error(`Unexpected import: ${name}`);
      },
      process: {
        env: {
          STRIPE_SECRET_KEY: "sk_test_mock",
          NEXT_PUBLIC_SITE_URL: "https://example.com",
          ...environment,
        },
      },
      console: { error() {} },
      Date,
      URL,
      Intl,
      Set,
      Map,
      Error,
    },
  );
  return output;
}
const menu = load("src/lib/holiday-menu.ts");
const deliveryConstants = load("src/lib/constants.ts");
const validation = load("src/lib/holiday-checkout.ts", {
  "./holiday-menu": menu,
  "./constants": deliveryConstants,
});
const settings = {
  ...menu.HOLIDAY_DRAFT_SETTINGS,
  orders_open: true,
  pickup_location: "Test pickup",
  delivery_zips: ["27513"],
};
const valid = {
  checkoutKey: "96de56dd-2edb-4e23-8828-ec02f8e8a947",
  version: 1,
  name: "Test customer",
  email: "TEST@example.com",
  phone: "9195550100",
  entree: menu.HOLIDAY_ENTREES[0],
  bread: menu.HOLIDAY_BREADS[0],
  dessert: menu.HOLIDAY_DESSERTS[0],
  people: 25,
  extraDessert: false,
  fulfillment: "pickup",
  address: "",
  zip: "",
  occasion: "thanksgiving",
  eventDate: "",
  consent: true,
  expectedTotal: 41669,
};
const now = new Date("2026-10-12T16:00:00Z");

test("package minimum and per-person pricing determine full payment at checkout", () => {
  assert.equal(menu.holidayQuote(settings, 18, false, false).totalCents, 30000);
  const quote = menu.holidayQuote(settings, 25, false, false);
  assert.equal(quote.totalCents, 41669);
  assert.equal(quote.depositCents, 41669);
  assert.equal(quote.balanceCents, 0);
});
test("second dessert and delivery are included in the full checkout payment", () => {
  const quote = menu.holidayQuote(
    { ...settings, delivery_fee_cents: 2500 },
    25,
    true,
    true,
  );
  assert.equal(quote.extraCents, 4500);
  assert.equal(quote.totalCents, 48669);
  assert.equal(quote.depositCents, 48669);
  assert.equal(
    menu.holidayQuote(settings, 25, true, false).depositCents,
    46169,
  );
  assert.equal(menu.holidayQuote(settings, 18, true, false).totalCents, 34500);
});
test("admins can change the base package and additional-guest rates", () => {
  const quote = menu.holidayQuote(
    {
      ...settings,
      per_person_cents: 2000,
      minimum_order_cents: 35000,
      extra_dessert_basis: "order",
      extra_dessert_cents: 2500,
    },
    25,
    true,
    false,
  );
  assert.equal(quote.totalCents, 51500);
});
test("odd-cent totals are collected once in full", () => {
  const quote = menu.holidayQuote(
    { ...settings, delivery_fee_cents: 1 },
    25,
    false,
    true,
  );
  assert.equal(quote.depositCents, 41670);
  assert.equal(quote.balanceCents, 0);
  assert.equal(quote.depositCents + quote.balanceCents, quote.totalCents);
});
test("invalid headcounts and unavailable upgrades are rejected", () => {
  for (const people of [17, 25.5, NaN, 1001])
    assert.throws(() => menu.holidayQuote(settings, people, false, false));
  assert.throws(
    () =>
      menu.holidayQuote(
        { ...settings, extra_dessert_cents: null },
        25,
        true,
        false,
      ),
    /unavailable/,
  );
});
test("checkout locks a verified price and records consent for the exact full payment", () => {
  const accepted = validation.validateHolidayCheckout(valid, settings, now);
  assert.equal(accepted.details.email, "test@example.com");
  assert.match(accepted.consent, /payment of \$416.69/);
  assert.doesNotMatch(accepted.consent, /in full|remaining balance/);
});
test("checkout rejects stale pricing, forged totals, missing consent and menu substitutions", () => {
  for (const change of [
    { version: 0 },
    { expectedTotal: 1 },
    { consent: false },
    { entree: "Anything" },
    { dessert: "Anything" },
    { people: "25" },
  ])
    assert.throws(() =>
      validation.validateHolidayCheckout(
        { ...valid, ...change },
        settings,
        now,
      ),
    );
});
test("holiday deadlines include the full Eastern calendar day", () => {
  validation.validateHolidayCheckout(
    valid,
    settings,
    new Date("2026-11-20T04:59:59Z"),
  );
  assert.throws(
    () =>
      validation.validateHolidayCheckout(
        valid,
        settings,
        new Date("2026-11-20T05:00:00Z"),
      ),
    /closed/,
  );
});
test("delivery ZIPs and party lead times are validated on the server", () => {
  assert.throws(
    () =>
      validation.validateHolidayCheckout(
        { ...valid, fulfillment: "delivery", address: "Test", zip: "99999" },
        settings,
        now,
      ),
    /North Carolina/,
  );
  const party = { ...valid, occasion: "party", eventDate: "2026-10-19" };
  validation.validateHolidayCheckout(party, settings, now);
  assert.throws(
    () =>
      validation.validateHolidayCheckout(
        { ...party, eventDate: "2026-10-18" },
        settings,
        now,
      ),
    /seven days/,
  );
  assert.throws(
    () =>
      validation.validateHolidayCheckout(
        { ...party, eventDate: "2026-02-30" },
        settings,
        now,
      ),
    /valid event/,
  );
});
function fixture() {
 const order = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Test', email: 'test@example.test',
  total_cents: 30000, deposit_cents: 30000, balance_cents: 0, consent_text: 'Full payment consent',
  deposit_status: 'pending', fulfillment_status: 'unfulfilled', balance_status: 'unpaid',
  stripe_customer_id: 'cus_test', stripe_checkout_session_id: null, stripe_payment_method_id: null };
 const calls = { checkout: 0, payment: 0, invoices: 0 };
 const stripe = {
  checkout: { sessions: {
   list: async () => ({ data: [] }),
   retrieve: async () => ({ status: 'open', url: 'https://checkout.example.test', amount_total: order.total_cents, currency: 'usd' }),
   create: async (input) => { calls.checkout++; calls.request=input; return { id: 'cs_test', status: 'open', url: 'https://checkout.example.test', amount_total: order.total_cents, currency: 'usd' }; },
  } },
  paymentIntents: { retrieve: async () => ({ id: 'pi_test', status: 'succeeded', amount_received: order.total_cents,
   currency: 'usd', customer: 'cus_test', metadata: { holiday_order_id: order.id }, payment_method: 'pm_test' }) },
 };
 const db = { rpc: async () => ({ data: [structuredClone(order)], error: null }), from() {
  let update; const filters=[];
  const q = { select() { return q; }, update(value) { update=value; return q; }, eq(key,value) { filters.push([key,value]); return q; },
   async single() { if(update)Object.assign(order,update);return {data:structuredClone(order),error:null}; },
   async maybeSingle() {
    if (update && !filters.every(([key,value])=>order[key]===value)) return {data:null,error:null};
    if(update)Object.assign(order,update);return {data:structuredClone(order),error:null};
   } }; return q;
 } };
 const payments = load('src/lib/holiday-payments.ts', { 'server-only': {}, stripe: class { constructor(){return stripe;} }, '@/lib/supabase/server': {} });
 const actions = load('src/app/admin/holidays/actions.ts', { '@/lib/constants': deliveryConstants, 'next/cache': { revalidatePath() {} }, '@/lib/auth/require-admin': { requireAdmin: async () => db } });
 return {order,calls,stripe,db,payments,actions};
}
test('checkout charges the full amount without authorizing a future card charge', async () => {
 const f=fixture(); await f.payments.startHolidayCheckout(f.db,f.order);
 assert.equal(f.calls.request.line_items[0].price_data.unit_amount,30000);
 assert.equal(f.calls.request.payment_intent_data.setup_future_usage,undefined);
 assert.match(f.calls.request.line_items[0].price_data.product_data.name,/Hassle-free Holidays/);
 assert.equal(await f.payments.startHolidayCheckout(f.db,f.order),'https://checkout.example.test');
 assert.equal(f.calls.checkout,1);
});
test('legacy half-payment checkouts cannot be created or reused', async () => {
 const f=fixture();Object.assign(f.order,{deposit_cents:15000,balance_cents:15000,stripe_checkout_session_id:'cs_old'});
 await assert.rejects(f.payments.startHolidayCheckout(f.db,f.order),/checkout is being updated/);
 assert.equal(f.calls.checkout,0);
});
test('a lost checkout response recovers a matching full-payment session', async () => {
 const f=fixture();f.stripe.checkout.sessions.list=async()=>({data:[{id:'cs_recovered',metadata:{holiday_order_id:f.order.id},status:'open',currency:'usd',amount_total:30000,url:'https://checkout.example.test'}]});
 await f.payments.startHolidayCheckout(f.db,f.order);
 assert.equal(f.order.stripe_checkout_session_id,'cs_recovered');assert.equal(f.calls.checkout,0);
});
test('the payment webhook requires the full amount and marks the order fully paid idempotently', async () => {
 const f=fixture();const session={id:'cs_test',metadata:{holiday_order_id:f.order.id},payment_status:'paid',currency:'usd',amount_total:30000,customer:'cus_test',payment_intent:'pi_test'};
 await assert.rejects(f.payments.recordHolidayPayment(f.db,{...session,amount_total:15000}),/verification failed/);
 assert.equal(f.order.deposit_status,'pending');
 await f.payments.recordHolidayPayment(f.db,session);await f.payments.recordHolidayPayment(f.db,session);
 assert.equal(f.order.deposit_status,'paid');assert.equal(f.order.balance_status,'paid');assert.equal(f.order.stripe_payment_method_id,null);
});
test('fulfillment is idempotent, requires full payment, and never contacts Stripe', async () => {
 const f=fixture();const form=new FormData();form.set('id',f.order.id);
 const unpaid=await f.actions.deliverHolidayOrder(null,form);assert.equal(unpaid.saved,false);
 Object.assign(f.order,{deposit_status:'paid',balance_status:'paid'});
 assert.equal((await f.actions.deliverHolidayOrder(null,form)).saved,true);
 assert.equal((await f.actions.deliverHolidayOrder(null,form)).saved,true);
 assert.equal(f.order.fulfillment_status,'delivered');assert.equal(f.calls.checkout,0);
});
test('admin pricing and fulfillment actions reject unauthorized callers', async () => {
 const actions=load('src/app/admin/holidays/actions.ts',{'@/lib/constants':deliveryConstants,'next/cache':{revalidatePath(){}},'@/lib/auth/require-admin':{requireAdmin:async()=>{throw new Error('Unauthorized');}}});
 for(const name of ['saveHolidaySettings','deliverHolidayOrder']) { const r=await actions[name](null,new FormData());assert.equal(r.saved,false);assert.match(r.error,/Unauthorized/); }
});

test('holiday delivery accepts all NC ZIPs, including ZIP+4, and rejects other states', () => {
  for (const zip of ['27006', '28909', '27601-1234']) {
    const result=validation.validateHolidayCheckout({...valid,expectedTotal:42669,fulfillment:'delivery',address:'1 NC Street',zip},settings,now);
    assert.equal(result.details.zip,zip.slice(0,5));
  }
  assert.throws(()=>validation.validateHolidayCheckout({...valid,fulfillment:'delivery',address:'1 SC Street',zip:'29601'},settings,now),/North Carolina/);
  assert.throws(()=>validation.validateHolidayCheckout({...valid,fulfillment:'delivery',address:'1 Street',zip:'27601',state:'SC'},settings,now),/North Carolina/);
});
