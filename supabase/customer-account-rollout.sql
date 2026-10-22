-- Customer account rollout: additive changes to the existing Supabase schema.
-- Apply before deploying customer-account code.
begin;

-- Source: 20260821_pricing_and_meal_size_foundation.sql
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

-- Source: 20260821_atomic_checkout_preparation.sql
-- Atomic, server-authoritative checkout preparation. This creates only unpaid
-- orders and their snapshots; it never creates Stripe objects or subscriptions.

alter table orders
  add column if not exists checkout_preparation_key uuid,
  add column if not exists checkout_request_fingerprint text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists delivery_zip text,
  add column if not exists delivery_fee_cents integer not null default 0,
  add column if not exists subscription_plan_id uuid references subscription_plans(id) on delete restrict,
  add column if not exists plan_code_snapshot text,
  add column if not exists plan_name_snapshot text,
  add column if not exists included_credits_snapshot integer,
  add column if not exists plan_price_cents_snapshot integer,
  add column if not exists billing_interval_snapshot text,
  add column if not exists billing_interval_count_snapshot integer,
  add column if not exists deposit_rate_cents integer not null default 300;

create unique index if not exists orders_checkout_preparation_key_uidx
  on orders (checkout_preparation_key)
  where checkout_preparation_key is not null;

create or replace function prepare_checkout_order(
  p_checkout_key uuid,
  p_request_fingerprint text,
  p_mode text,
  p_subscription_plan_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_delivery_zip text,
  p_auth_user_id uuid,
  p_account_email text,
  p_items jsonb,
  p_deposit_per_container_cents integer,
  p_delivery_fee_cents integer
) returns table (
  order_id uuid,
  subtotal_cents integer,
  deposit_cents integer,
  delivery_fee_cents integer,
  total_cents integer,
  containers integer,
  payment_status text,
  fulfillment_status text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing orders%rowtype;
  v_customer customers%rowtype;
  v_plan subscription_plans%rowtype;
  v_order orders%rowtype;
  v_total_units integer;
  v_subtotal integer;
  v_deposit integer;
  v_invalid_count integer;
  v_menu_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_checkout_key::text, 0));
  select * into v_existing from orders where checkout_preparation_key = p_checkout_key;
  if found then
    if v_existing.checkout_request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'Checkout preparation key was already used for different details.';
    end if;
    return query select v_existing.id, v_existing.subtotal_cents, v_existing.deposit_cents,
      v_existing.delivery_fee_cents, v_existing.total_cents, v_existing.containers_issued,
      v_existing.payment_status, v_existing.fulfillment_status;
    return;
  end if;

  if p_mode not in ('one_time', 'subscription') then raise exception 'Invalid order mode.'; end if;
  if p_request_fingerprint is null or length(p_request_fingerprint) <> 64 then raise exception 'Invalid checkout request.'; end if;
  if coalesce(trim(p_contact_name), '') = '' or coalesce(trim(p_contact_email), '') = '' then raise exception 'Customer contact details are required.'; end if;
  if p_delivery_zip !~ '^\d{5}$' then raise exception 'A valid delivery ZIP is required.'; end if;
  if p_deposit_per_container_cents < 0 or p_delivery_fee_cents < 0 then raise exception 'Invalid order fees.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your order is empty.'; end if;

  select count(*) into v_invalid_count
  from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
  where i.meal_id is null or i.meal_size_id is null or i.quantity is null
    or i.quantity <= 0 or i.quantity > 1000;
  if v_invalid_count > 0 then raise exception 'Invalid order item.'; end if;

  select count(*) into v_invalid_count from (
    select meal_id, meal_size_id
    from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
    group by meal_id, meal_size_id having count(*) > 1
  ) duplicates;
  if v_invalid_count > 0 then raise exception 'Duplicate order item.'; end if;

  select coalesce(sum(quantity), 0)::integer into v_total_units
  from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer);

  perform 1
  from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
  join meals m on m.id = i.meal_id
  join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id
  for share of m, s;

  select id into v_menu_id from weekly_menus where is_published order by week_start desc limit 1;
  select count(*) into v_invalid_count
  from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
  left join meals m on m.id = i.meal_id
  left join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id
  where m.id is null or not m.is_active or s.id is null or not s.is_active
    or s.servings is null or s.servings <= 0
    or not exists(select 1 from weekly_menu_items mi where mi.menu_id=v_menu_id and mi.meal_id=m.id and not mi.sold_out);
  if v_invalid_count > 0 then raise exception 'One or more selected meals or sizes are unavailable.'; end if;

  if p_mode = 'one_time' then
    if p_subscription_plan_id is not null then raise exception 'One-time orders cannot include a subscription plan.'; end if;
    select count(*) into v_invalid_count
    from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
    join meals m on m.id = i.meal_id
    join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id
    where not m.is_available_for_one_time or not s.is_available_for_one_time or s.price_cents <= 0;
    if v_invalid_count > 0 then raise exception 'One or more sizes are not available for one-time purchase.'; end if;

    select sum(s.price_cents::bigint * i.quantity)::integer into v_subtotal
    from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
    join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id;
  else
    if p_subscription_plan_id is null then raise exception 'A subscription plan is required.'; end if;
    select * into v_plan from subscription_plans
    where id = p_subscription_plan_id and is_active = true
    for share;
    if not found or v_plan.included_credits <= 0 or v_plan.price_cents <= 0
      or v_plan.billing_interval not in ('day','week','month','year') or v_plan.billing_interval_count <= 0
    then raise exception 'The selected subscription plan is unavailable.'; end if;
    if v_total_units <> v_plan.included_credits then raise exception 'The selected meals do not fill this subscription plan.'; end if;

    select count(*) into v_invalid_count
    from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
    join meals m on m.id = i.meal_id
    join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id
    where not m.is_available_for_subscription or not s.is_available_for_subscription;
    if v_invalid_count > 0 then raise exception 'One or more meals are not available for this subscription.'; end if;
    v_subtotal := v_plan.price_cents;
  end if;

  if p_auth_user_id is not null then
    select * into v_customer from customers where auth_user_id = p_auth_user_id;
    if not found then
      if coalesce(trim(p_account_email), '') = '' then raise exception 'The signed-in account has no email address.'; end if;
      insert into customers (auth_user_id, email, full_name, zip, state)
      values (p_auth_user_id, lower(trim(p_account_email)), trim(p_contact_name), p_delivery_zip, 'NC')
      returning * into v_customer;
    end if;
  else
    select * into v_customer from customers where lower(email)=lower(trim(p_contact_email));
    if not found then
      insert into customers (email, full_name, zip, state)
      values (lower(trim(p_contact_email)), trim(p_contact_name), p_delivery_zip, 'NC')
      returning * into v_customer;
    end if;
  end if;

  v_deposit := case when p_mode='one_time' then v_total_units else greatest(0, v_total_units - case when p_auth_user_id is null then 0 else coalesce(v_customer.containers_out, 0) end) end * p_deposit_per_container_cents;

  insert into orders (
    customer_id, subscription_id, order_type, status, subtotal_cents, deposit_cents,
    delivery_fee_cents, total_cents, containers_issued, stripe_checkout_session_id,
    stripe_payment_intent_id, payment_status, fulfillment_status, paid_at,
    checkout_preparation_key, checkout_request_fingerprint, contact_name, contact_email,
    delivery_zip, subscription_plan_id, plan_code_snapshot, plan_name_snapshot,
    included_credits_snapshot, plan_price_cents_snapshot, billing_interval_snapshot,
    billing_interval_count_snapshot, deposit_rate_cents
  ) values (
    v_customer.id, null, p_mode, 'pending', v_subtotal, v_deposit,
    p_delivery_fee_cents, v_subtotal + v_deposit + p_delivery_fee_cents, v_total_units,
    null, null, 'unpaid', 'unfulfilled', null, p_checkout_key, p_request_fingerprint,
    trim(p_contact_name), lower(trim(p_contact_email)), p_delivery_zip,
    case when p_mode = 'subscription' then v_plan.id else null end,
    case when p_mode = 'subscription' then v_plan.code else null end,
    case when p_mode = 'subscription' then v_plan.name else null end,
    case when p_mode = 'subscription' then v_plan.included_credits else null end,
    case when p_mode = 'subscription' then v_plan.price_cents else null end,
    case when p_mode = 'subscription' then v_plan.billing_interval else null end,
    case when p_mode = 'subscription' then v_plan.billing_interval_count else null end, p_deposit_per_container_cents
  ) returning * into v_order;

  insert into order_items (
    order_id, meal_id, meal_size_id, meal_name_snapshot, size_label_snapshot,
    servings_snapshot, unit_price_cents, quantity
  )
  select v_order.id, m.id, s.id, m.name, s.label, s.servings,
    case when p_mode = 'one_time' then s.price_cents else 0 end,
    i.quantity
  from jsonb_to_recordset(p_items) as i(meal_id uuid, meal_size_id uuid, quantity integer)
  join meals m on m.id = i.meal_id
  join meal_sizes s on s.id = i.meal_size_id and s.meal_id = i.meal_id;

  return query select v_order.id, v_order.subtotal_cents, v_order.deposit_cents,
    v_order.delivery_fee_cents, v_order.total_cents, v_order.containers_issued,
    v_order.payment_status, v_order.fulfillment_status;
end;
$$;

revoke all on function prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer) from public, anon, authenticated;
grant execute on function prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer) to service_role;

-- Source: 20261011_customer_accounts.sql
-- Customer order management. Apply after schema.sql and pricing/size foundation.
-- New columns are additive; no existing orders or ledger entries are rewritten.
begin;
alter table orders
  add column if not exists delivery_address_line1 text,
  add column if not exists delivery_address_line2 text,
  add column if not exists delivery_city text,
  add column if not exists delivery_zip text,
  add column if not exists delivery_notes text,
  add column if not exists delivery_fee_cents integer not null default 0,
  add column if not exists customer_change_id uuid,
  add column if not exists needs_meal_selection boolean not null default false,
  add column if not exists deposit_rate_cents integer not null default 300;

create table if not exists customer_order_changes (
  id uuid primary key default uuid_generate_v4(),
  request_key uuid unique not null,
  order_id uuid not null references orders(id),
  customer_id uuid not null references customers(id),
  operation text not null check (operation in ('edit','cancel')),
  status text not null default 'pending' check (status in ('pending','waiting_payment','applied','failed')),
  old_total_cents integer not null,
  new_total_cents integer not null,
  paid boolean not null,
  payload jsonb not null,
  stripe_checkout_session_id text,
  stripe_refund_id text,
  error_message text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
alter table customer_order_changes enable row level security;
grant select on customer_order_changes to authenticated;
grant all on customer_order_changes to service_role;
drop policy if exists "customers read own order changes" on customer_order_changes;
create policy "customers read own order changes" on customer_order_changes for select to authenticated
  using (exists(select 1 from customers c where c.id=customer_id and c.auth_user_id=auth.uid()));

create table if not exists subscription_week_choices (
  id uuid primary key default uuid_generate_v4(),
  subscription_id uuid not null references subscriptions(id),
  menu_id uuid not null references weekly_menus(id),
  items jsonb not null,
  updated_at timestamptz not null default now(),
  unique(subscription_id,menu_id)
);
alter table subscription_week_choices enable row level security;
grant select on subscription_week_choices to authenticated;
grant all on subscription_week_choices to service_role;
drop policy if exists "customers read own subscription choices" on subscription_week_choices;
create policy "customers read own subscription choices" on subscription_week_choices for select to authenticated
 using (exists(select 1 from subscriptions s join customers c on c.id=s.customer_id where s.id=subscription_id and c.auth_user_id=auth.uid()));
alter table subscriptions add column if not exists resumes_at timestamptz,
 add column if not exists cancel_at_period_end boolean not null default false;

create or replace function begin_customer_order_change(
 p_user_id uuid,p_order_id uuid,p_request_key uuid,p_operation text,p_items jsonb,p_address jsonb
) returns customer_order_changes
language plpgsql security invoker set search_path=public as $$
declare
 o orders%rowtype; change customer_order_changes%rowtype;
 v_total integer; v_units integer; v_deposit integer; v_items jsonb; v_menu uuid;
 v_is_paid boolean;
begin
 select * into o from orders where id=p_order_id for update;
 if not found or not exists(select 1 from customers where id=o.customer_id and auth_user_id=p_user_id) then raise exception 'Order not found.'; end if;
 select * into change from customer_order_changes where request_key=p_request_key;
 if found then
  if change.order_id<>o.id or change.customer_id<>o.customer_id then raise exception 'Invalid request.'; end if;
  if change.payload->'request' is distinct from jsonb_build_object('operation',p_operation,'items',p_items,'address',p_address) then raise exception 'This request key was already used for different changes.'; end if;
  return change;
 end if;
 if now()>=o.created_at+interval '24 hours' or o.created_at>now() then raise exception 'The 24-hour order change window has ended.'; end if;
 if p_operation not in ('edit','cancel') then raise exception 'Invalid operation.'; end if;
 if o.status not in ('pending','paid','packing') then raise exception 'This order can no longer be changed.'; end if;
 if p_operation='edit' and o.status='packing' then raise exception 'This order is already being prepared.'; end if;
 if o.customer_change_id is not null then raise exception 'An order change is already processing. Please wait for it to finish.'; end if;
 v_is_paid := o.payment_status in ('paid','partially_refunded') or o.status in ('paid','packing');
 if p_operation='cancel' then
  v_total:=0; v_items:='[]'::jsonb; v_deposit:=0; v_units:=0;
 else
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Choose at least one meal.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) where quantity is null or quantity<1 or quantity>1000) then raise exception 'Enter positive whole-number quantities.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) group by meal_id,meal_size_id having count(*)>1) then raise exception 'Duplicate meal selection.'; end if;
  select id into v_menu from weekly_menus where is_published order by week_start desc limit 1;
  if exists(
   select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer)
   left join meals m on m.id=i.meal_id left join meal_sizes s on s.id=i.meal_size_id and s.meal_id=m.id
   where (m.id is null or s.id is null or not m.is_active or not s.is_active or s.servings is null or s.servings<=0
    or not exists(select 1 from weekly_menu_items w where w.menu_id=v_menu and w.meal_id=m.id and not w.sold_out)
    or (o.order_type='one_time' and (not m.is_available_for_one_time or not s.is_available_for_one_time or s.price_cents<=0))
    or (o.order_type='subscription' and (not m.is_available_for_subscription or not s.is_available_for_subscription))
  ) and not exists(select 1 from order_items original where original.order_id=o.id and original.meal_id=i.meal_id and original.meal_size_id=i.meal_size_id and original.quantity=i.quantity)
  ) then raise exception 'One or more selected meals are unavailable.'; end if;
  select sum(i.quantity)::integer,jsonb_agg(jsonb_build_object('meal_id',m.id,'meal_size_id',s.id,'meal_name_snapshot',m.name,'size_label_snapshot',s.label,'servings_snapshot',s.servings,'quantity',i.quantity,'unit_price_cents',case when o.order_type='one_time' then coalesce((select original.unit_price_cents from order_items original where original.order_id=o.id and original.meal_size_id=s.id and original.quantity=i.quantity limit 1),s.price_cents) else 0 end))
   into v_units,v_items from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer)
   join meals m on m.id=i.meal_id join meal_sizes s on s.id=i.meal_size_id and s.meal_id=m.id;
  if o.order_type='subscription' then
   if v_units<>coalesce(o.included_credits_snapshot,(select coalesce(sum(quantity),0) from order_items where order_id=o.id)) then raise exception 'Subscription selections must keep the same total number of meals.'; end if;
   v_total:=o.subtotal_cents;
  else
   select sum((x->>'unit_price_cents')::bigint*(x->>'quantity')::integer)::integer into v_total from jsonb_array_elements(v_items) x;
  end if;
  -- Keep the original per-container deposit rate; never trust fees from the browser.
  v_deposit:=greatest(0,o.deposit_cents+(v_units-o.containers_issued)*o.deposit_rate_cents);
  v_total:=v_total+v_deposit+o.delivery_fee_cents;
  if coalesce(p_address->>'zip','') !~ '^\d{5}$' or (p_address->>'zip')::integer not between 27006 and 28909 then raise exception 'Enter a North Carolina delivery ZIP.'; end if;
  if coalesce(trim(p_address->>'address_line1'),'')='' or coalesce(trim(p_address->>'city'),'')='' then raise exception 'Enter your delivery street address and city.'; end if;
 end if;
 insert into customer_order_changes(request_key,order_id,customer_id,operation,old_total_cents,new_total_cents,paid,payload)
 values(p_request_key,o.id,o.customer_id,p_operation,o.total_cents,v_total,v_is_paid,jsonb_build_object('items',v_items,'address',p_address,'deposit_cents',v_deposit,'units',v_units,'request',jsonb_build_object('operation',p_operation,'items',p_items,'address',p_address))) returning * into change;
 update orders set customer_change_id=change.id where id=o.id;
 return change;
end $$;

create or replace function finish_customer_order_change(p_change_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare ch customer_order_changes%rowtype; o orders%rowtype;
begin
 select * into ch from customer_order_changes where id=p_change_id for update;
 if not found then raise exception 'Order change not found.'; end if;
 if ch.status='applied' then return; end if;
 select * into o from orders where id=ch.order_id for update;
 if o.customer_change_id is distinct from ch.id then raise exception 'This order change is no longer current.'; end if;
 if ch.status not in ('pending','waiting_payment') then raise exception 'This change cannot be applied.'; end if;
 if ch.operation='cancel' then
  update orders set status='canceled',fulfillment_status='canceled',payment_status=case when ch.paid then 'refunded' else payment_status end,customer_change_id=null where id=o.id;
 else
  delete from order_items where order_id=o.id;
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select o.id,i.meal_id,i.meal_size_id,i.meal_name_snapshot,i.size_label_snapshot,i.servings_snapshot,i.quantity,i.unit_price_cents from jsonb_to_recordset(ch.payload->'items') as i(meal_id uuid,meal_size_id uuid,meal_name_snapshot text,size_label_snapshot text,servings_snapshot integer,quantity integer,unit_price_cents integer);
  update orders set total_cents=ch.new_total_cents,deposit_cents=(ch.payload->>'deposit_cents')::integer,
   subtotal_cents=ch.new_total_cents-(ch.payload->>'deposit_cents')::integer-delivery_fee_cents,
   needs_meal_selection=false,containers_issued=(ch.payload->>'units')::integer,
   delivery_address_line1=ch.payload#>>'{address,address_line1}',delivery_address_line2=ch.payload#>>'{address,address_line2}',delivery_city=ch.payload#>>'{address,city}',delivery_zip=ch.payload#>>'{address,zip}',delivery_notes=ch.payload#>>'{address,delivery_notes}',customer_change_id=null where id=o.id;
 end if;
 update customer_order_changes set status='applied',applied_at=now() where id=ch.id;
end $$;

-- A reservation stops preparation/shipping while refunds or extra payments settle.
create or replace function guard_customer_order_change() returns trigger language plpgsql as $$
begin
 if new.needs_meal_selection and new.status in ('packing','out_for_delivery','delivered') then raise exception 'The customer must choose meals before this order can be prepared.'; end if;
 if old.customer_change_id is not null and new.customer_change_id is not null and new.status is distinct from old.status then
  raise exception 'An order change is processing. Finish it before changing fulfillment status.';
 end if;
 return new;
end $$;
drop trigger if exists guard_customer_order_change on orders;
create trigger guard_customer_order_change before update on orders for each row execute function guard_customer_order_change();

revoke all on function begin_customer_order_change(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function finish_customer_order_change(uuid) from public,anon,authenticated;
grant execute on function begin_customer_order_change(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function finish_customer_order_change(uuid) to service_role;

create or replace function save_customer_week_choices(p_user_id uuid,p_subscription_id uuid,p_menu_id uuid,p_items jsonb) returns void
language plpgsql security invoker set search_path=public as $$
declare s subscriptions%rowtype; w weekly_menus%rowtype; units integer;
begin
 select * into s from subscriptions where id=p_subscription_id for update;
 if not found or not exists(select 1 from customers where id=s.customer_id and auth_user_id=p_user_id) then raise exception 'Subscription not found.'; end if;
 if s.status<>'active' or s.cancel_at_period_end then raise exception 'Resume your subscription before choosing upcoming meals.'; end if;
 select * into w from weekly_menus where id=p_menu_id and is_published;
 if not found or w.week_start<=(now() at time zone 'America/New_York')::date then raise exception 'Choose a published upcoming menu. Choices close when the menu week starts.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Choose your meals.'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) where quantity is null or quantity<1 or quantity>1000) then raise exception 'Invalid meal quantity.'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) group by meal_id,meal_size_id having count(*)>1) then raise exception 'Duplicate meal selection.'; end if;
 select sum(quantity)::integer into units from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer);
 if units<>coalesce(s.included_credits_snapshot,s.plan_size) then raise exception 'Select exactly the number of meals included in your plan.'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer)
  left join meals m on m.id=i.meal_id left join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id
  where m.id is null or z.id is null or not m.is_active or not m.is_available_for_subscription or not z.is_active or not z.is_available_for_subscription or z.servings is null or z.servings<=0
   or not exists(select 1 from weekly_menu_items mi where mi.menu_id=w.id and mi.meal_id=m.id and not mi.sold_out)
 ) then raise exception 'One or more meals are unavailable for this subscription.'; end if;
 insert into subscription_week_choices(subscription_id,menu_id,items) values(s.id,w.id,p_items)
 on conflict(subscription_id,menu_id) do update set items=excluded.items,updated_at=now();
end $$;
revoke all on function save_customer_week_choices(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function save_customer_week_choices(uuid,uuid,uuid,jsonb) to service_role;


create or replace function discard_customer_order_change(p_user_id uuid,p_change_id uuid) returns void
language plpgsql security invoker set search_path=public as $$
declare ch customer_order_changes%rowtype;
begin
 select * into ch from customer_order_changes where id=p_change_id for update;
 if not found or not exists(select 1 from customers where id=ch.customer_id and auth_user_id=p_user_id) then raise exception 'Order change not found.'; end if;
 if ch.operation<>'edit' or ch.status not in ('pending','waiting_payment') or ch.stripe_refund_id is not null or (ch.paid and ch.new_total_cents<ch.old_total_cents) then raise exception 'This change cannot be discarded.'; end if;
 update orders set customer_change_id=null where id=ch.order_id and customer_change_id=ch.id;
 update customer_order_changes set status='failed',error_message='Discarded by customer before settlement' where id=ch.id;
end $$;
revoke all on function discard_customer_order_change(uuid,uuid) from public,anon,authenticated;
grant execute on function discard_customer_order_change(uuid,uuid) to service_role;


-- Source: 20261011_customer_billing.sql
alter table orders add column if not exists stripe_invoice_id text,
 add column if not exists needs_meal_selection boolean not null default false;
create unique index if not exists orders_stripe_invoice_uidx on orders(stripe_invoice_id) where stripe_invoice_id is not null;
create unique index if not exists subscriptions_stripe_subscription_uidx on subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;

create or replace function record_customer_checkout_payment(p_order_id uuid,p_session_id text,p_payment_intent_id text,p_stripe_customer_id text,p_stripe_subscription_id text,p_stripe_price_id text,p_recurring_amount integer)
returns void language plpgsql security invoker set search_path=public as $$
declare o orders%rowtype; subscription_key uuid; units integer;
begin
 select * into o from orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 if o.customer_change_id is not null then raise exception 'Order change is in progress; retry payment confirmation.'; end if;
 if o.status='canceled' then raise exception 'Order is already canceled.'; end if;
 if o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id<>p_session_id then raise exception 'Payment session does not match this order.'; end if;
 if p_stripe_customer_id is not null then update customers set stripe_customer_id=coalesce(stripe_customer_id,p_stripe_customer_id) where id=o.customer_id; end if;
 if p_stripe_subscription_id is not null then
  select coalesce(sum(quantity),0)::integer into units from order_items where order_id=o.id;
  insert into subscriptions(customer_id,subscription_plan_id,plan_size,plan_code_snapshot,plan_name_snapshot,included_credits_snapshot,price_cents_snapshot,billing_interval_snapshot,billing_interval_count_snapshot,stripe_price_id,stripe_subscription_id)
   values(o.customer_id,o.subscription_plan_id,units,o.plan_code_snapshot,coalesce(o.plan_name_snapshot,units||' meals per week'),units,p_recurring_amount,coalesce(o.billing_interval_snapshot,'week'),coalesce(o.billing_interval_count_snapshot,1),p_stripe_price_id,p_stripe_subscription_id)
   on conflict(stripe_subscription_id) where stripe_subscription_id is not null do update set stripe_price_id=excluded.stripe_price_id
   returning id into subscription_key;
 end if;
 update orders set status=case when status='pending' then 'paid' else status end,payment_status='paid',paid_at=coalesce(paid_at,now()),stripe_checkout_session_id=p_session_id,stripe_payment_intent_id=coalesce(p_payment_intent_id,stripe_payment_intent_id),subscription_id=coalesce(subscription_key,subscription_id) where id=o.id;
end $$;

create or replace function record_customer_subscription_invoice(p_invoice_id text,p_stripe_subscription_id text,p_payment_intent_id text,p_amount integer)
returns void language plpgsql security invoker set search_path=public as $$
declare s subscriptions%rowtype; w weekly_menus%rowtype; choices jsonb; created_order uuid; c customers%rowtype; previous orders%rowtype;
begin
 if p_amount<=0 then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_invoice_id,0));
 if exists(select 1 from orders where stripe_invoice_id=p_invoice_id) then return; end if;
 select * into s from subscriptions where stripe_subscription_id=p_stripe_subscription_id for update;
 if not found then raise exception 'Subscription not yet synchronized; retry invoice.'; end if;
 select * into c from customers where id=s.customer_id;
 select * into previous from orders where subscription_id=s.id order by created_at desc limit 1;
 select * into w from weekly_menus where is_published and week_start>=(now() at time zone 'America/New_York')::date order by week_start desc limit 1;
 select items into choices from subscription_week_choices where subscription_id=s.id and menu_id=w.id;
 if choices is not null and (select sum(quantity) from jsonb_to_recordset(choices) as i(quantity integer))<>coalesce(s.included_credits_snapshot,s.plan_size) then choices:=null; end if;
 if choices is not null and exists(select 1 from jsonb_to_recordset(choices) as i(meal_id uuid,meal_size_id uuid,quantity integer) left join meals m on m.id=i.meal_id left join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id where m.id is null or z.id is null or not m.is_active or not m.is_available_for_subscription or not z.is_active or not z.is_available_for_subscription or z.servings is null or z.servings<=0 or not exists(select 1 from weekly_menu_items mi where mi.menu_id=w.id and mi.meal_id=m.id and not mi.sold_out)) then choices:=null; end if;
 insert into orders(customer_id,subscription_id,order_type,status,payment_status,fulfillment_status,paid_at,week_start,subtotal_cents,total_cents,containers_issued,stripe_invoice_id,stripe_payment_intent_id,needs_meal_selection,delivery_address_line1,delivery_address_line2,delivery_city,delivery_zip,delivery_notes,included_credits_snapshot)
 values(s.customer_id,s.id,'subscription','paid','paid','unfulfilled',now(),w.week_start,p_amount,p_amount,coalesce(s.included_credits_snapshot,s.plan_size),p_invoice_id,p_payment_intent_id,choices is null,c.address_line1,c.address_line2,c.city,c.zip,c.delivery_notes,coalesce(s.included_credits_snapshot,s.plan_size)) returning id into created_order;
 if choices is not null then
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select created_order,m.id,z.id,m.name,z.label,z.servings,i.quantity,0 from jsonb_to_recordset(choices) as i(meal_id uuid,meal_size_id uuid,quantity integer) join meals m on m.id=i.meal_id join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id;
 end if;
end $$;
revoke all on function record_customer_checkout_payment(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function record_customer_subscription_invoice(text,text,text,integer) from public,anon,authenticated;
grant execute on function record_customer_checkout_payment(uuid,text,text,text,text,text,integer) to service_role;
grant execute on function record_customer_subscription_invoice(text,text,text,integer) to service_role;

commit;
