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
