-- Apply after customer-account-rollout.sql, before deploying the subscription mix UI.
-- Existing order and subscription price snapshots are retained.
begin;

-- Keep this classification in sync with admin-meal-categories.ts and subscription-mix.ts.
create or replace function subscription_meal_kind(p_name text,p_tags text[])
returns text language plpgsql immutable set search_path=public as $$
declare category text; meal_name text:=lower(coalesce(p_name,''));
begin
 if 'uncategorized'=any(p_tags) then return null; end if;
 select tag into category from unnest(array['breakfast','main-dishes','salads-bowls','sides','desserts','soups']) with ordinality as c(tag,priority)
 where tag=any(p_tags) order by priority limit 1;
 if category is null then
  category:=case
   when meal_name ~ 'frittata|hash|waffle|huevos|pancake|quiche|deviled egg' then 'breakfast'
   when meal_name ~ 'pudding|cupcake|cookie|fruit pie' then 'desserts'
   when meal_name ~ 'soup|stew\y' then 'soups'
   when meal_name ~ 'salad|bowl' then 'salads-bowls'
   when meal_name ~ 'green bean|okra|corn$|carrot|potato|veggie medley|beets|rice & peas|squash casserole' then 'sides'
   when meal_name ~ 'chicken|fish|cod|shrimp|pasta|noodle|tofu|pie|flatbread|wrap|empanada|masala|lo mein|fried rice' then 'main-dishes'
   else 'uncategorized' end;
 end if;
 return case when category='sides' then 'side' when category in ('main-dishes','breakfast','soups','salads-bowls') then 'entree' else null end;
end $$;

create or replace function subscription_mix_valid(p_items jsonb,p_required integer)
returns boolean language sql stable set search_path=public as $$
 select coalesce(p_required>0 and p_required%2=0
  and bool_and(i.quantity is not null and i.quantity>0 and i.quantity<=1000 and m.id is not null and subscription_meal_kind(m.name,m.tags) is not null)
  and sum(case when subscription_meal_kind(m.name,m.tags)='side' then i.quantity else 0 end)=p_required/2
  and sum(case when subscription_meal_kind(m.name,m.tags)='entree' then i.quantity else 0 end)=p_required/2,false)
 from jsonb_to_recordset(p_items) as i(meal_id uuid,quantity integer)
 left join meals m on m.id=i.meal_id;
$$;

create or replace function assert_subscription_mix(p_items jsonb,p_required integer)
returns void language plpgsql set search_path=public as $$
begin
 if not subscription_mix_valid(p_items,p_required) then
  raise exception 'Your subscription must contain exactly % sides and % entrées. Breakfast, soups and salads count as entrées.',p_required/2,p_required/2;
 end if;
end $$;

revoke all on function subscription_meal_kind(text,text[]), subscription_mix_valid(jsonb,integer), assert_subscription_mix(jsonb,integer) from public,anon,authenticated;
grant execute on function subscription_meal_kind(text,text[]), subscription_mix_valid(jsonb,integer), assert_subscription_mix(jsonb,integer) to service_role;

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
    perform assert_subscription_mix(p_items,v_plan.included_credits);
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
   perform assert_subscription_mix(p_items,coalesce(o.included_credits_snapshot,(select coalesce(sum(quantity),0)::integer from order_items where order_id=o.id)));
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
 perform assert_subscription_mix(p_items,coalesce(s.included_credits_snapshot,s.plan_size));
 insert into subscription_week_choices(subscription_id,menu_id,items) values(s.id,w.id,p_items)
 on conflict(subscription_id,menu_id) do update set items=excluded.items,updated_at=now();
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
 if choices is not null and not subscription_mix_valid(choices,coalesce(s.included_credits_snapshot,s.plan_size)) then choices:=null; end if;
 insert into orders(customer_id,subscription_id,order_type,status,payment_status,fulfillment_status,paid_at,week_start,subtotal_cents,total_cents,containers_issued,stripe_invoice_id,stripe_payment_intent_id,needs_meal_selection,delivery_address_line1,delivery_address_line2,delivery_city,delivery_zip,delivery_notes,included_credits_snapshot)
 values(s.customer_id,s.id,'subscription','paid','paid','unfulfilled',now(),w.week_start,p_amount,p_amount,coalesce(s.included_credits_snapshot,s.plan_size),p_invoice_id,p_payment_intent_id,choices is null,c.address_line1,c.address_line2,c.city,c.zip,c.delivery_notes,coalesce(s.included_credits_snapshot,s.plan_size)) returning id into created_order;
 if choices is not null then
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select created_order,m.id,z.id,m.name,z.label,z.servings,i.quantity,0 from jsonb_to_recordset(choices) as i(meal_id uuid,meal_size_id uuid,quantity integer) join meals m on m.id=i.meal_id join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id;
 end if;
end $$;

-- New subscriptions and voluntary plan changes use these rates. Historical snapshots stay intact.
update subscription_plans set price_cents=10500,updated_at=now() where code='weekly-8';
update subscription_plans set price_cents=16500,updated_at=now() where code='weekly-12';
commit;
