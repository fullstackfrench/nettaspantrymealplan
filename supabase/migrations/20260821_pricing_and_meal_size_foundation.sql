-- Pricing and meal-size data-model foundation.
-- This migration does not change checkout, cart, admin UI, or Stripe objects.

alter table meals
  add column if not exists is_available_for_one_time boolean not null default true,
  add column if not exists is_available_for_subscription boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table meal_sizes
  add column if not exists servings integer,
  add column if not exists is_active boolean not null default true,
  add column if not exists is_available_for_one_time boolean not null default true,
  add column if not exists is_available_for_subscription boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meal_sizes_servings_check'
      and conrelid = 'meal_sizes'::regclass
  ) then
    alter table meal_sizes
      add constraint meal_sizes_servings_check
      check (servings is null or servings > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meal_sizes_price_cents_check'
      and conrelid = 'meal_sizes'::regclass
  ) then
    alter table meal_sizes
      add constraint meal_sizes_price_cents_check
      check (price_cents > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meal_sizes_meal_id_label_key'
      and conrelid = 'meal_sizes'::regclass
  ) then
    alter table meal_sizes
      add constraint meal_sizes_meal_id_label_key unique (meal_id, label);
  end if;
end
$$;

-- Launch model C: a meal may designate at most one active size for inclusion
-- in subscriptions. Other sizes remain eligible for one-time purchase only.
create unique index if not exists meal_sizes_one_subscription_size_per_meal_uidx
  on meal_sizes (meal_id)
  where is_active = true and is_available_for_subscription = true;

create table if not exists subscription_plans (
  id                      uuid primary key default uuid_generate_v4(),
  code                    text unique not null,
  name                    text not null,
  blurb                   text,
  included_credits        integer not null check (included_credits > 0),
  price_cents             integer not null check (price_cents > 0),
  billing_interval        text not null default 'week'
                          check (billing_interval in ('day','week','month','year')),
  billing_interval_count  integer not null default 1 check (billing_interval_count > 0),
  is_active               boolean not null default true,
  sort_order              integer not null default 0,
  stripe_product_id       text,
  current_stripe_price_id text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists subscription_plans_stripe_product_uidx
  on subscription_plans (stripe_product_id)
  where stripe_product_id is not null;

create unique index if not exists subscription_plans_stripe_price_uidx
  on subscription_plans (current_stripe_price_id)
  where current_stripe_price_id is not null;

insert into subscription_plans
  (code, name, blurb, included_credits, price_cents, billing_interval, billing_interval_count, sort_order)
values
  ('weekly-6', '6 meals / week', 'Lunches sorted.', 6, 8100, 'week', 1, 0),
  ('weekly-8', '8 meals / week', 'Most popular.', 8, 10200, 'week', 1, 1),
  ('weekly-12', '12 meals / week', 'Best value, feeds two.', 12, 14340, 'week', 1, 2)
on conflict (code) do nothing;

alter table subscriptions
  add column if not exists subscription_plan_id uuid references subscription_plans(id) on delete restrict,
  add column if not exists plan_code_snapshot text,
  add column if not exists plan_name_snapshot text,
  add column if not exists included_credits_snapshot integer,
  add column if not exists price_cents_snapshot integer,
  add column if not exists billing_interval_snapshot text,
  add column if not exists billing_interval_count_snapshot integer,
  add column if not exists stripe_price_id text;

alter table order_items
  add column if not exists meal_size_id uuid references meal_sizes(id) on delete set null,
  add column if not exists meal_name_snapshot text,
  add column if not exists size_label_snapshot text,
  add column if not exists servings_snapshot integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_items_servings_snapshot_check'
      and conrelid = 'order_items'::regclass
  ) then
    alter table order_items
      add constraint order_items_servings_snapshot_check
      check (servings_snapshot is null or servings_snapshot > 0);
  end if;
end
$$;

update order_items oi
set meal_name_snapshot = m.name
from meals m
where m.id = oi.meal_id
  and oi.meal_name_snapshot is null;

alter table subscription_plans enable row level security;

drop policy if exists "public reads active subscription plans" on subscription_plans;
create policy "public reads active subscription plans" on subscription_plans
  for select using (is_active = true);

-- No size rows are backfilled or recreated here. Existing sizes need an admin
-- review before servings can be required by checkout.
--
-- IMPORTANT: saveMeal currently deletes and recreates all meal_sizes rows.
-- Checkout must not rely on persistent meal_size_id values until that behavior
-- is separately replaced with stable row updates/deactivation.
