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
const validation = load("src/lib/holiday-checkout.ts", {
  "./holiday-menu": menu,
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
  expectedTotal: 40000,
};
const now = new Date("2026-10-12T16:00:00Z");

test("package minimum and per-person pricing determine the 50% deposit", () => {
  assert.equal(menu.holidayQuote(settings, 15, false, false).totalCents, 30000);
  const quote = menu.holidayQuote(settings, 25, false, false);
  assert.equal(quote.totalCents, 40000);
  assert.equal(quote.depositCents, 20000);
  assert.equal(quote.balanceCents, 20000);
});
test("second dessert and delivery are included in both payment amounts", () => {
  const quote = menu.holidayQuote(
    { ...settings, delivery_fee_cents: 2500 },
    25,
    true,
    true,
  );
  assert.equal(quote.extraCents, 12500);
  assert.equal(quote.totalCents, 55000);
  assert.equal(quote.depositCents, 27500);
  assert.equal(
    menu.holidayQuote(settings, 25, true, false).depositCents,
    26250,
  );
  assert.equal(menu.holidayQuote(settings, 15, true, false).totalCents, 31500);
});
test("admins can change rates and choose per-order dessert pricing", () => {
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
  assert.equal(quote.totalCents, 52500);
});
test("odd-cent totals split exactly, with no extra cent charged", () => {
  const quote = menu.holidayQuote(
    { ...settings, delivery_fee_cents: 1 },
    25,
    false,
    true,
  );
  assert.equal(quote.depositCents, 20001);
  assert.equal(quote.balanceCents, 20000);
  assert.equal(quote.depositCents + quote.balanceCents, quote.totalCents);
});
test("invalid headcounts and unavailable upgrades are rejected", () => {
  for (const people of [14, 25.5, NaN, 1001])
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
test("checkout locks a verified price and records consent for the exact balance", () => {
  const accepted = validation.validateHolidayCheckout(valid, settings, now);
  assert.equal(accepted.details.email, "test@example.com");
  assert.match(accepted.consent, /\$200.00 deposit/);
  assert.match(accepted.consent, /\$400.00 holiday order/);
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
    /eligible/,
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

function fixture({
  decline = false,
  processing = false,
  wrongCustomer = false,
} = {}) {
  const order = {
    id: "order-1",
    full_name: "Test",
    email: "test@example.com",
    total_cents: 40000,
    deposit_cents: 20000,
    balance_cents: 20000,
    consent_text: "Consent",
    deposit_status: "paid",
    fulfillment_status: "delivered",
    balance_status: "unpaid",
    stripe_customer_id: "cus_test",
    stripe_payment_method_id: "pm_test",
    stripe_balance_invoice_id: null,
    stripe_checkout_session_id: "cs_test",
    billing_lease_until: null,
  };
  const counts = { create: 0, lines: 0, pay: 0, finalize: 0 };
  let invoice = null;
  let declines = decline;
  const stripe = {
    invoices: {
      async list() {
        return { data: invoice ? [structuredClone(invoice)] : [] };
      },
      async create(input) {
        counts.create++;
        invoice = {
          id: "in_test",
          customer: wrongCustomer ? "cus_other" : input.customer,
          currency: "usd",
          metadata: input.metadata,
          total: 0,
          amount_paid: 0,
          amount_remaining: 0,
          status: "draft",
          attempt_count: 0,
          hosted_invoice_url: null,
          payment_intent: null,
          lines: { data: [] },
        };
        return structuredClone(invoice);
      },
      async retrieve() {
        return structuredClone(invoice);
      },
      async listLineItems() {
        return { data: structuredClone(invoice.lines.data) };
      },
      async finalizeInvoice() {
        counts.finalize++;
        invoice.status = "open";
        invoice.hosted_invoice_url = "https://invoice.stripe.com/test";
        if (processing) invoice.payment_intent = "pi_processing";
        return structuredClone(invoice);
      },
      async pay(_id, input) {
        assert.equal(input.off_session, true);
        counts.pay++;
        invoice.attempt_count++;
        if (declines) throw new Error("Declined");
        invoice.status = "paid";
        invoice.amount_paid = invoice.total;
        invoice.amount_remaining = 0;
        return structuredClone(invoice);
      },
    },
    invoiceItems: {
      async create(input) {
        counts.lines++;
        invoice.total += input.amount;
        invoice.amount_remaining = invoice.total;
        invoice.lines.data.push({
          amount: input.amount,
          metadata: input.metadata,
        });
      },
    },
    paymentIntents: {
      async retrieve() {
        return { status: "processing" };
      },
    },
    checkout: {
      sessions: {
        async retrieve() {
          return { status: "open", url: "https://checkout.stripe.com/test" };
        },
      },
    },
  };
  const db = {
    async rpc(name) {
      if (name === "claim_holiday_checkout") return { data: [], error: null };
      if (
        order.balance_status === "paid" ||
        order.billing_lease_until ||
        order.deposit_status !== "paid" ||
        order.fulfillment_status !== "delivered"
      )
        return { data: [], error: null };
      order.billing_lease_until = "locked";
      return { data: [structuredClone(order)], error: null };
    },
    from() {
      let update;
      const query = {
        update(values) {
          update = values;
          return query;
        },
        select() {
          return query;
        },
        eq() {
          return query;
        },
        async single() {
          if (update) Object.assign(order, update);
          return { data: structuredClone(order), error: null };
        },
      };
      return query;
    },
  };
  const payments = load("src/lib/holiday-payments.ts", {
    "server-only": {},
    stripe: class StripeMock {
      constructor() {
        return stripe;
      }
    },
    "@/lib/supabase/server": {},
  });
  return {
    db,
    order,
    counts,
    stripe,
    payments,
    allowPayment() {
      declines = false;
    },
  };
}
test("fulfillment creates one invoice and repeated delivery clicks do not charge twice", async () => {
  const f = fixture();
  await f.payments.collectHolidayBalance(f.db, f.order.id);
  await f.payments.collectHolidayBalance(f.db, f.order.id);
  assert.equal(f.order.balance_status, "paid");
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.lines, 1);
  assert.equal(f.counts.pay, 1);
  assert.equal(f.order.billing_lease_until, null);
});
test("failed balance payment retains delivery and the existing invoice for retry", async () => {
  const f = fixture({ decline: true });
  await assert.rejects(
    f.payments.collectHolidayBalance(f.db, f.order.id),
    /needs attention/,
  );
  assert.equal(f.order.fulfillment_status, "delivered");
  assert.equal(f.order.balance_status, "action_required");
  assert.equal(f.order.invoice_url, "https://invoice.stripe.com/test");
  f.allowPayment();
  await f.payments.collectHolidayBalance(f.db, f.order.id);
  assert.equal(f.order.balance_status, "paid");
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.lines, 1);
  assert.equal(f.counts.pay, 2);
});
test("concurrent balance clicks are serialized", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.payments.collectHolidayBalance(f.db, f.order.id),
    f.payments.collectHolidayBalance(f.db, f.order.id),
  ]);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.pay, 1);
});
test("processing payment intent is not charged again", async () => {
  const f = fixture({ processing: true });
  await f.payments.collectHolidayBalance(f.db, f.order.id);
  assert.equal(f.order.balance_status, "processing");
  assert.equal(f.counts.pay, 0);
});
test("invoice customer mismatch prevents payment", async () => {
  const f = fixture({ wrongCustomer: true });
  await assert.rejects(f.payments.collectHolidayBalance(f.db, f.order.id));
  assert.equal(f.counts.pay, 0);
});
test("out-of-order failed invoice event uses current paid state", async () => {
  const f = fixture();
  await f.payments.collectHolidayBalance(f.db, f.order.id);
  await f.payments.recordHolidayInvoice(f.db, "in_test");
  assert.equal(f.order.balance_status, "paid");
  assert.equal(f.order.payment_error, null);
});
test("no balance charge before deposit payment and fulfillment", async () => {
  for (const update of [
    { deposit_status: "pending" },
    { fulfillment_status: "unfulfilled" },
  ]) {
    const f = fixture();
    Object.assign(f.order, update);
    await assert.rejects(f.payments.collectHolidayBalance(f.db, f.order.id));
    assert.equal(f.counts.pay, 0);
  }
});

test("deposit Checkout saves the card only for the consented remaining balance", async () => {
  const f = fixture();
  Object.assign(f.order, {
    stripe_checkout_session_id: null,
    deposit_status: "pending",
  });
  f.db.rpc = async () => ({ data: [structuredClone(f.order)], error: null });
  f.stripe.checkout.sessions.list = async () => ({ data: [] });
  let request;
  f.stripe.checkout.sessions.create = async (input) => {
    request = input;
    return {
      id: "cs_new",
      status: "open",
      url: "https://checkout.stripe.com/test",
    };
  };
  await f.payments.startHolidayCheckout(f.db, f.order);
  assert.equal(request.payment_intent_data.setup_future_usage, "off_session");
  assert.equal(request.line_items[0].price_data.unit_amount, 20000);
  assert.equal(request.custom_text.submit.message, f.order.consent_text);
  assert.equal(f.order.stripe_checkout_session_id, "cs_new");
});
test("lost Checkout response recovers its existing session instead of creating another", async () => {
  const f = fixture();
  Object.assign(f.order, {
    stripe_checkout_session_id: null,
    deposit_status: "pending",
  });
  f.db.rpc = async () => ({ data: [structuredClone(f.order)], error: null });
  f.stripe.checkout.sessions.list = async () => ({
    data: [
      {
        id: "cs_recovered",
        status: "open",
        url: "https://checkout.stripe.com/recovered",
        metadata: { holiday_order_id: f.order.id },
      },
    ],
  });
  f.stripe.checkout.sessions.create = async () => {
    throw new Error("Duplicate session");
  };
  assert.equal(
    await f.payments.startHolidayCheckout(f.db, f.order),
    "https://checkout.stripe.com/recovered",
  );
  assert.equal(f.order.stripe_checkout_session_id, "cs_recovered");
});
test("verified deposit webhook records the saved method and rejects mismatched deposits", async () => {
  const f = fixture();
  f.order.deposit_status = "pending";
  const session = {
    id: "cs_test",
    currency: "usd",
    amount_total: 20000,
    payment_status: "paid",
    customer: "cus_test",
    payment_intent: "pi_deposit",
    metadata: { holiday_order_id: f.order.id },
  };
  await assert.rejects(
    f.payments.recordHolidayDeposit(f.db, { ...session, amount_total: 1 }),
    /verification/,
  );
  assert.equal(f.order.deposit_status, "pending");
  f.stripe.paymentIntents.retrieve = async () => ({
    id: "pi_deposit",
    status: "succeeded",
    currency: "usd",
    amount_received: 20000,
    customer: "cus_test",
    payment_method: "pm_deposit",
    metadata: { holiday_order_id: f.order.id },
  });
  await f.payments.recordHolidayDeposit(f.db, session);
  assert.equal(f.order.deposit_status, "paid");
  assert.equal(f.order.stripe_payment_method_id, "pm_deposit");
});
test("admin pricing and fulfillment actions reject unauthorized callers before mutation", async () => {
  let billingCalled = false;
  const actions = load("src/app/admin/holidays/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/require-admin": {
      async requireAdmin() {
        throw new Error("Unauthorized");
      },
    },
    "@/lib/holiday-payments": {
      async collectHolidayBalance() {
        billingCalled = true;
      },
    },
  });
  assert.equal(
    (await actions.saveHolidaySettings({}, new FormData())).error,
    "Unauthorized",
  );
  assert.equal(
    (await actions.deliverHolidayOrder({}, new FormData())).error,
    "Unauthorized",
  );
  assert.equal(billingCalled, false);
});
