-- Stripe payment-state foundation.
-- Keeps the legacy orders.status column intact while payment and fulfillment
-- consumers are migrated in later, separately approved steps.

alter table orders
  add column if not exists stripe_checkout_session_id text,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists fulfillment_status text not null default 'unfulfilled',
  add column if not exists paid_at timestamptz,
  add column if not exists checkout_expires_at timestamptz;

-- Older checkout code stored Checkout Session IDs in the PaymentIntent field.
-- Move those values before the identifiers receive separate unique indexes.
update orders
set stripe_checkout_session_id = stripe_payment_intent_id,
    stripe_payment_intent_id = null
where stripe_payment_intent_id like 'cs\_%' escape '\'
  and stripe_checkout_session_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_payment_status_check'
      and conrelid = 'orders'::regclass
  ) then
    alter table orders
      add constraint orders_payment_status_check
      check (payment_status in ('unpaid','processing','paid','failed','refunded','partially_refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_fulfillment_status_check'
      and conrelid = 'orders'::regclass
  ) then
    alter table orders
      add constraint orders_fulfillment_status_check
      check (fulfillment_status in ('unfulfilled','packing','out_for_delivery','delivered','canceled'));
  end if;
end
$$;

create unique index if not exists orders_stripe_checkout_session_uidx
  on orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists orders_stripe_payment_intent_uidx
  on orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table if not exists stripe_webhook_events (
  stripe_event_id    text primary key,
  event_type         text not null,
  processing_status text not null default 'processing',
  order_id           uuid references orders(id) on delete set null,
  error_message      text,
  created_at         timestamptz not null default now(),
  processed_at       timestamptz,
  constraint stripe_webhook_events_processing_status_check
    check (processing_status in ('processing','processed','failed'))
);

create index if not exists stripe_webhook_events_order_idx
  on stripe_webhook_events (order_id);

alter table stripe_webhook_events enable row level security;

-- No public or authenticated policies are intentional. Only trusted server
-- code using the service-role key may read or write webhook processing state.
