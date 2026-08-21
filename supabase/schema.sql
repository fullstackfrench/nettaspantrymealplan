-- ============================================================
-- Sustainable meal prep service — database schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor).
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- MEALS ----------
create table if not exists meals (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,
  name            text not null,
  subtitle        text,                       -- the "with Salsa Verde & Crema" line
  description     text,
  chef_name       text not null default 'Chef',
  chef_avatar_url text,
  image_url       text,
  price_cents     integer not null default 1350,
  calories        integer,
  protein_g       integer,
  carbs_g         integer,
  fat_g           integer,
  ingredients     text[] not null default '{}',
  allergen_free   text[] not null default '{}', -- e.g. {'Gluten Free','Dairy Free'}
  tags            text[] not null default '{}', -- filter chips: seafood, vegetarian, etc.
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists meals_tags_idx on meals using gin (tags);
create index if not exists meals_active_idx on meals (is_active);

-- ---------- MEAL SIZES ----------
-- Optional per-meal size/price variants (e.g. Regular $13.95 / Family $24.95).
-- A meal with no rows here just uses meals.price_cents as its one price.
create table if not exists meal_sizes (
  id          uuid primary key default uuid_generate_v4(),
  meal_id     uuid not null references meals(id) on delete cascade,
  label       text not null,
  price_cents integer not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists meal_sizes_meal_idx on meal_sizes (meal_id);

-- ---------- PROFILES ----------
-- Mirrors auth.users 1:1 so we have somewhere to put a role. Admin promotion
-- happens in code (src/app/auth/after-auth.ts checks ADMIN_EMAILS), not here —
-- every new signup starts as a plain 'customer'.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'customer',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role) values (new.id, 'customer');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- STORAGE ----------
-- Public bucket for meal photos, uploaded via the admin panel using the
-- service role (see uploadMealPhoto in src/app/admin/actions.ts), so no
-- public write policy is needed on the bucket itself.
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', true)
on conflict (id) do nothing;

-- ---------- WEEKLY MENUS ----------
create table if not exists weekly_menus (
  id           uuid primary key default uuid_generate_v4(),
  week_start   date not null unique,          -- Monday of the delivery week
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists weekly_menu_items (
  id        uuid primary key default uuid_generate_v4(),
  menu_id   uuid not null references weekly_menus(id) on delete cascade,
  meal_id   uuid not null references meals(id) on delete cascade,
  sold_out  boolean not null default false,
  unique (menu_id, meal_id)
);

-- ---------- CUSTOMERS ----------
create table if not exists customers (
  id                  uuid primary key default uuid_generate_v4(),
  auth_user_id        uuid unique,            -- links to auth.users
  email               text not null unique,
  full_name           text,
  phone               text,
  address_line1       text,
  address_line2       text,
  city                text,
  state               text not null default 'NC',
  zip                 text,
  delivery_notes      text,
  containers_out      integer not null default 0,
  deposit_held_cents  integer not null default 0,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

-- ---------- SUBSCRIPTIONS ----------
create table if not exists subscriptions (
  id                     uuid primary key default uuid_generate_v4(),
  customer_id            uuid not null references customers(id) on delete cascade,
  plan_size              integer not null,    -- meals per week: 6, 8, 12
  status                 text not null default 'active',  -- active | paused | canceled
  stripe_subscription_id text,
  created_at             timestamptz not null default now()
);

-- ---------- ORDERS ----------
create table if not exists orders (
  id                       uuid primary key default uuid_generate_v4(),
  customer_id              uuid not null references customers(id) on delete restrict,
  subscription_id          uuid references subscriptions(id) on delete set null,
  order_type               text not null default 'one_time',  -- one_time | subscription
  status                   text not null default 'pending',
  -- pending | paid | packing | out_for_delivery | delivered | canceled
  week_start               date,
  delivery_date            date,
  subtotal_cents           integer not null default 0,
  deposit_cents            integer not null default 0,
  total_cents              integer not null default 0,
  containers_issued        integer not null default 0,
  containers_returned      integer not null default 0,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payment_status           text not null default 'unpaid'
                           check (payment_status in ('unpaid','processing','paid','failed','refunded','partially_refunded')),
  fulfillment_status       text not null default 'unfulfilled'
                           check (fulfillment_status in ('unfulfilled','packing','out_for_delivery','delivered','canceled')),
  paid_at                  timestamptz,
  checkout_expires_at      timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists orders_status_idx on orders (status);
create unique index if not exists orders_stripe_checkout_session_uidx
  on orders (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create unique index if not exists orders_stripe_payment_intent_uidx
  on orders (stripe_payment_intent_id) where stripe_payment_intent_id is not null;

create table if not exists order_items (
  id               uuid primary key default uuid_generate_v4(),
  order_id         uuid not null references orders(id) on delete cascade,
  meal_id          uuid not null references meals(id) on delete restrict,
  quantity         integer not null default 1,
  unit_price_cents integer not null
);

-- ---------- STRIPE WEBHOOK IDEMPOTENCY ----------
-- Webhook handlers insert the Stripe event ID before applying side effects.
-- The primary key makes repeat delivery safe to detect and ignore.
create table if not exists stripe_webhook_events (
  stripe_event_id  text primary key,
  event_type       text not null,
  processing_status text not null default 'processing'
                    check (processing_status in ('processing','processed','failed')),
  order_id         uuid references orders(id) on delete set null,
  error_message    text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz
);

create index if not exists stripe_webhook_events_order_idx
  on stripe_webhook_events (order_id);

-- ---------- CONTAINER / DEPOSIT LEDGER ----------
-- Every glass container movement is an event. A customer's containers_out and
-- deposit_held_cents are kept in sync by the trigger below, so the ledger is
-- always the source of truth and you can audit any discrepancy.
create table if not exists container_events (
  id                 uuid primary key default uuid_generate_v4(),
  customer_id        uuid not null references customers(id) on delete cascade,
  order_id           uuid references orders(id) on delete set null,
  kind               text not null,  -- issued | returned | lost | forgiven
  quantity           integer not null,
  deposit_delta_cents integer not null default 0, -- + charged, - refunded
  note               text,
  created_at         timestamptz not null default now()
);

create or replace function apply_container_event() returns trigger as $$
begin
  update customers set
    containers_out = greatest(0, containers_out + case
      when new.kind = 'issued'   then new.quantity
      when new.kind in ('returned','lost','forgiven') then -new.quantity
      else 0 end),
    deposit_held_cents = greatest(0, deposit_held_cents + new.deposit_delta_cents)
  where id = new.customer_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists container_event_applied on container_events;
create trigger container_event_applied
  after insert on container_events
  for each row execute function apply_container_event();

-- ---------- ROW LEVEL SECURITY ----------
alter table meals             enable row level security;
alter table meal_sizes        enable row level security;
alter table profiles          enable row level security;
alter table weekly_menus      enable row level security;
alter table weekly_menu_items enable row level security;
alter table customers         enable row level security;
alter table subscriptions     enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table stripe_webhook_events enable row level security;
alter table container_events  enable row level security;

-- Anyone can browse the menu.
drop policy if exists "public reads active meals" on meals;
create policy "public reads active meals" on meals
  for select using (is_active = true);

drop policy if exists "public reads sizes of active meals" on meal_sizes;
create policy "public reads sizes of active meals" on meal_sizes
  for select using (
    exists (select 1 from meals m where m.id = meal_id and m.is_active = true)
  );

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile" on profiles
  for select using (id = auth.uid());

drop policy if exists "public reads published menus" on weekly_menus;
create policy "public reads published menus" on weekly_menus
  for select using (is_published = true);

drop policy if exists "public reads published menu items" on weekly_menu_items;
create policy "public reads published menu items" on weekly_menu_items
  for select using (
    exists (select 1 from weekly_menus m where m.id = menu_id and m.is_published)
  );

-- Customers see only their own records.
drop policy if exists "customer reads self" on customers;
create policy "customer reads self" on customers
  for select using (auth_user_id = auth.uid());

drop policy if exists "customer updates self" on customers;
create policy "customer updates self" on customers
  for update using (auth_user_id = auth.uid());

drop policy if exists "customer reads own orders" on orders;
create policy "customer reads own orders" on orders
  for select using (
    exists (select 1 from customers c where c.id = customer_id and c.auth_user_id = auth.uid())
  );

drop policy if exists "customer reads own order items" on order_items;
create policy "customer reads own order items" on order_items
  for select using (
    exists (
      select 1 from orders o join customers c on c.id = o.customer_id
      where o.id = order_id and c.auth_user_id = auth.uid()
    )
  );

-- NOTE: the admin panel uses the service role key on the server, which bypasses
-- RLS entirely. That is why admin routes must never be exposed to the browser.
