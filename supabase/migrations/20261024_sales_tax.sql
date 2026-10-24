-- Apply before deploying fixed 8.25% Stripe sales tax. Historical orders stay unchanged.
begin;
alter table public.orders add column if not exists tax_cents integer not null default 0 check(tax_cents>=0),
 add column if not exists tax_rate_bps integer not null default 0 check(tax_rate_bps in(0,825));
alter table public.holiday_orders add column if not exists tax_cents integer not null default 0 check(tax_cents>=0),
 add column if not exists tax_rate_bps integer not null default 0 check(tax_rate_bps in(0,825));
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.holiday_orders'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%total_cents%food_cents%'
 loop execute format('alter table public.holiday_orders drop constraint %I',c.conname); end loop;
end $$;
alter table public.holiday_orders add constraint holiday_tax_total_check
 check(total_cents=food_cents+extra_cents+delivery_cents+tax_cents);
-- Optional parameters preserve compatibility while the new app is deploying.
drop function if exists public.prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer);
drop function if exists public.prepare_holiday_order(uuid,integer,jsonb,integer,text);
drop function if exists public.record_customer_subscription_invoice(text,text,text,integer);
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
  p_delivery_fee_cents integer,
  p_tax_rate_bps integer default 0
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
  v_tax integer;
  v_existing orders%rowtype;
  v_customer customers%rowtype;
  v_plan subscription_plans%rowtype;
  v_order orders%rowtype;
  v_total_units integer;
  v_subtotal integer;
  v_deposit integer;
  v_invalid_count integer;
  v_menu_id uuid;
  v_menu_week date;
  v_glass_fee integer;
begin
  if p_tax_rate_bps not in (0,825) or p_tax_rate_bps is null then raise exception 'Invalid tax rate.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_checkout_key::text, 0));
  select * into v_existing from orders where checkout_preparation_key = p_checkout_key;
  if found then
    if v_existing.tax_rate_bps <> p_tax_rate_bps then raise exception 'Tax changed. Start a new checkout.'; end if;
    if v_existing.checkout_request_fingerprint is distinct from p_request_fingerprint then
      raise exception 'Checkout preparation key was already used for different details.';
    end if;
    return query select v_existing.id, v_existing.subtotal_cents, v_existing.deposit_cents,
      v_existing.delivery_fee_cents, v_existing.total_cents, v_existing.containers_issued,
      v_existing.payment_status, v_existing.fulfillment_status;
    return;
  end if;

  if not coalesce((select checkout_enabled from public.meal_ordering_settings where id=1),false) then raise exception 'Ordering is being updated. Please try again shortly.'; end if;
  if p_mode not in ('one_time', 'subscription') then raise exception 'Invalid order mode.'; end if;
  if p_request_fingerprint is null or length(p_request_fingerprint) <> 64 then raise exception 'Invalid checkout request.'; end if;
  if coalesce(trim(p_contact_name), '') = '' or coalesce(trim(p_contact_email), '') = '' then raise exception 'Customer contact details are required.'; end if;
  if not public.is_nc_delivery_zip(p_delivery_zip) then raise exception 'Delivery is available only within North Carolina.'; end if;
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

  select id,week_start into v_menu_id,v_menu_week from weekly_menus where is_published order by week_start desc limit 1;
  if not public.weekly_menu_accepts_orders(v_menu_week) then raise exception 'New weekly orders close Monday at 8:00 p.m. Eastern. Please wait for the next published menu.'; end if;
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

  -- Serialize all checkouts for this customer before deciding whether the fee is due.
  select * into v_customer from customers where id=v_customer.id for update;
  if v_customer.glass_fee_paid_at is not null or exists(select 1 from public.glass_deposit_credits where email=lower(v_customer.email)) then
    if p_auth_user_id is null or v_customer.auth_user_id is distinct from p_auth_user_id then
      raise exception 'Sign in to continue checkout with your existing customer account.';
    end if;
    v_glass_fee:=0;
  else
    if exists(select 1 from orders pending_order where pending_order.customer_id=v_customer.id and pending_order.glass_fee_cents>0 and pending_order.payment_status='unpaid' and pending_order.status='pending') then
      raise exception 'An unpaid order already includes your one-time glass deposit. Complete or cancel that order before placing another.';
    end if;
    v_glass_fee:=5000;
  end if;
  v_deposit:=0;


  v_tax:=round(v_subtotal::numeric*p_tax_rate_bps/10000)::integer+round(v_glass_fee::numeric*p_tax_rate_bps/10000)::integer+round(p_delivery_fee_cents::numeric*p_tax_rate_bps/10000)::integer;
  insert into orders (
    customer_id, subscription_id, order_type, status, subtotal_cents, deposit_cents,
    tax_cents, tax_rate_bps, delivery_fee_cents, total_cents, containers_issued, stripe_checkout_session_id,
    stripe_payment_intent_id, payment_status, fulfillment_status, paid_at,
    checkout_preparation_key, checkout_request_fingerprint, contact_name, contact_email,
    delivery_zip, subscription_plan_id, plan_code_snapshot, plan_name_snapshot,
    included_credits_snapshot, plan_price_cents_snapshot, billing_interval_snapshot,
    billing_interval_count_snapshot, deposit_rate_cents, glass_fee_cents, week_start
  ) values (
    v_customer.id, null, p_mode, 'pending', v_subtotal, v_deposit,
    v_tax, p_tax_rate_bps, p_delivery_fee_cents, v_subtotal + v_deposit + v_glass_fee + p_delivery_fee_cents + v_tax, v_total_units,
    null, null, 'unpaid', 'unfulfilled', null, p_checkout_key, p_request_fingerprint,
    trim(p_contact_name), lower(trim(p_contact_email)), p_delivery_zip,
    case when p_mode = 'subscription' then v_plan.id else null end,
    case when p_mode = 'subscription' then v_plan.code else null end,
    case when p_mode = 'subscription' then v_plan.name else null end,
    case when p_mode = 'subscription' then v_plan.included_credits else null end,
    case when p_mode = 'subscription' then v_plan.price_cents else null end,
    case when p_mode = 'subscription' then v_plan.billing_interval else null end,
    case when p_mode = 'subscription' then v_plan.billing_interval_count else null end, 0, v_glass_fee, v_menu_week
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
 v_tax integer := 0; v_total integer; v_units integer; v_deposit integer; v_items jsonb; v_menu uuid;
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
  v_tax:=case when v_is_paid then round(o.glass_fee_cents::numeric*o.tax_rate_bps/10000)::integer else 0 end;
  v_total:=case when v_is_paid then o.glass_fee_cents+v_tax else 0 end; v_items:='[]'::jsonb; v_deposit:=0; v_units:=0;
 else
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Choose at least one meal.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) where quantity is null or quantity<1 or quantity>1000) then raise exception 'Enter positive whole-number quantities.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer) group by meal_id,meal_size_id having count(*)>1) then raise exception 'Duplicate meal selection.'; end if;
  select id into v_menu from weekly_menus where is_published order by week_start desc limit 1;
  if not public.weekly_menu_accepts_orders(coalesce(o.week_start,(select week_start from weekly_menus where id=v_menu)))
   and (exists(select meal_id,meal_size_id,quantity from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer)
     except select meal_id,meal_size_id,quantity from order_items where order_id=o.id)
    or exists(select meal_id,meal_size_id,quantity from order_items where order_id=o.id
     except select meal_id,meal_size_id,quantity from jsonb_to_recordset(p_items) as i(meal_id uuid,meal_size_id uuid,quantity integer)))
   then raise exception 'Meal selections close Monday at 8:00 p.m. Eastern. Eligible address changes and cancellations remain available.'; end if;
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
  v_tax:=round(v_total::numeric*o.tax_rate_bps/10000)::integer+round(v_deposit::numeric*o.tax_rate_bps/10000)::integer+round(o.delivery_fee_cents::numeric*o.tax_rate_bps/10000)::integer+round(o.glass_fee_cents::numeric*o.tax_rate_bps/10000)::integer;
  if v_total=o.subtotal_cents and v_deposit=o.deposit_cents then v_tax:=o.tax_cents; end if;
  v_total:=v_total+v_deposit+o.delivery_fee_cents+o.glass_fee_cents+v_tax;
  if not public.is_nc_delivery_zip(p_address->>'zip') then raise exception 'Enter a North Carolina delivery ZIP.'; end if;
  if coalesce(trim(p_address->>'address_line1'),'')='' or coalesce(trim(p_address->>'city'),'')='' then raise exception 'Enter your delivery street address and city.'; end if;
 end if;
 insert into customer_order_changes(request_key,order_id,customer_id,operation,old_total_cents,new_total_cents,paid,payload)
 values(p_request_key,o.id,o.customer_id,p_operation,o.total_cents,v_total,v_is_paid,jsonb_build_object('tax_cents',v_tax,'items',v_items,'address',p_address,'deposit_cents',v_deposit,'units',v_units,'request',jsonb_build_object('operation',p_operation,'items',p_items,'address',p_address))) returning * into change;
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
  update orders set status='canceled',fulfillment_status='canceled',payment_status=case when ch.paid and o.glass_fee_cents>0 then 'partially_refunded' when ch.paid then 'refunded' else payment_status end,customer_change_id=null where id=o.id;
 else
  delete from order_items where order_id=o.id;
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select o.id,i.meal_id,i.meal_size_id,i.meal_name_snapshot,i.size_label_snapshot,i.servings_snapshot,i.quantity,i.unit_price_cents from jsonb_to_recordset(ch.payload->'items') as i(meal_id uuid,meal_size_id uuid,meal_name_snapshot text,size_label_snapshot text,servings_snapshot integer,quantity integer,unit_price_cents integer);
  update orders set total_cents=ch.new_total_cents,deposit_cents=(ch.payload->>'deposit_cents')::integer,
   tax_cents=coalesce((ch.payload->>'tax_cents')::integer,0),
   subtotal_cents=ch.new_total_cents-coalesce((ch.payload->>'tax_cents')::integer,0)-(ch.payload->>'deposit_cents')::integer-delivery_fee_cents-glass_fee_cents,
   needs_meal_selection=false,containers_issued=(ch.payload->>'units')::integer,
   delivery_address_line1=ch.payload#>>'{address,address_line1}',delivery_address_line2=ch.payload#>>'{address,address_line2}',delivery_city=ch.payload#>>'{address,city}',delivery_zip=ch.payload#>>'{address,zip}',delivery_notes=ch.payload#>>'{address,delivery_notes}',customer_change_id=null where id=o.id;
 end if;
 update customer_order_changes set status='applied',applied_at=now() where id=ch.id;
end $$;

create or replace function public.prepare_holiday_order(p_key uuid, p_version integer, p_details jsonb, p_total integer, p_consent text, p_tax_rate_bps integer default 0)
returns public.holiday_orders language plpgsql security definer set search_path = public as $$
declare
  s public.holiday_settings;
  o public.holiday_orders;
  n integer := (p_details->>'people')::integer;
  food integer;
  extra integer;
  delivery integer;
  total integer; tax integer;
begin
  if p_tax_rate_bps not in (0,825) or p_tax_rate_bps is null then raise exception 'Invalid tax rate.'; end if;
  -- A retry of the same browser submission never creates a second booking.
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into o from public.holiday_orders where checkout_key = p_key;
  if found then
    if o.email <> p_details->>'email' or o.full_name <> p_details->>'full_name'
      or o.people <> n or o.entree <> p_details->>'entree' or o.bread <> p_details->>'bread'
      or o.dessert <> p_details->>'dessert' or o.extra_dessert <> (p_details->>'extra_dessert')::boolean
      or o.fulfillment <> p_details->>'fulfillment' or o.occasion <> p_details->>'occasion'
      or o.event_date <> (p_details->>'event_date')::date or o.address <> p_details->>'address'
      or o.zip <> p_details->>'zip' or o.phone <> p_details->>'phone'
      or o.tax_rate_bps <> p_tax_rate_bps or o.total_cents <> p_total or o.settings_version <> p_version then
      raise exception 'This checkout was already started with different selections. Reload the page to begin a new order.';
    end if;
    return o;
  end if;
  select * into strict s from public.holiday_settings where id = 1 for share;
  if not s.orders_open then raise exception 'Holiday ordering is not open yet.'; end if;
  if s.version <> p_version then raise exception 'Holiday pricing changed. Reload the page to review the current total.'; end if;
  if p_details->>'fulfillment'='delivery' and not public.is_nc_delivery_zip(p_details->>'zip') then raise exception 'Delivery is available only within North Carolina.'; end if;
  if n < s.minimum_people or n > 1000 then raise exception 'Invalid group size'; end if;
  if (p_details->>'extra_dessert')::boolean and s.extra_dessert_cents is null then raise exception 'Second dessert unavailable'; end if;
  extra := case when (p_details->>'extra_dessert')::boolean then s.extra_dessert_cents * case when s.extra_dessert_basis = 'person' then n else 1 end else 0 end;
  delivery := case when p_details->>'fulfillment' = 'delivery' then s.delivery_fee_cents else 0 end;
  food := s.minimum_order_cents + (n-s.minimum_people)*s.per_person_cents;
  tax:=round((food+extra+delivery)::numeric*p_tax_rate_bps/10000)::integer;
  total := food + extra + delivery + tax;
  if total <> p_total then raise exception 'Holiday pricing changed. Reload the page to review the current total.'; end if;
  insert into public.holiday_orders(tax_cents,tax_rate_bps,checkout_key, full_name, email, phone, occasion, event_date, fulfillment, address, zip, people, entree, bread, dessert, extra_dessert, settings_version, pricing_snapshot, food_cents, extra_cents, delivery_cents, total_cents, deposit_cents, balance_cents, consent_text)
  values(tax,p_tax_rate_bps,p_key, p_details->>'full_name', p_details->>'email', p_details->>'phone', p_details->>'occasion', (p_details->>'event_date')::date, p_details->>'fulfillment', p_details->>'address', p_details->>'zip', n, p_details->>'entree', p_details->>'bread', p_details->>'dessert', (p_details->>'extra_dessert')::boolean, s.version, to_jsonb(s), food, extra, delivery, total, total, 0, p_consent) returning * into o;
  return o;
end;
$$;

create or replace function record_customer_subscription_invoice(p_invoice_id text,p_stripe_subscription_id text,p_payment_intent_id text,p_amount integer,p_tax_cents integer default 0,p_delivery_cents integer default 0,p_tax_rate_bps integer default 0)
returns void language plpgsql security invoker set search_path=public as $$
declare s subscriptions%rowtype; w weekly_menus%rowtype; choices jsonb; created_order uuid; c customers%rowtype; previous orders%rowtype;
begin
 if p_amount<=0 then return; end if;
 if p_tax_cents<0 or p_delivery_cents<0 or p_amount<p_tax_cents+p_delivery_cents or p_tax_rate_bps not in (0,825) then raise exception 'Invalid invoice totals.'; end if;
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
 insert into orders(tax_cents,tax_rate_bps,delivery_fee_cents,customer_id,subscription_id,order_type,status,payment_status,fulfillment_status,paid_at,week_start,subtotal_cents,total_cents,containers_issued,stripe_invoice_id,stripe_payment_intent_id,needs_meal_selection,delivery_address_line1,delivery_address_line2,delivery_city,delivery_zip,delivery_notes,included_credits_snapshot)
 values(p_tax_cents,p_tax_rate_bps,p_delivery_cents,s.customer_id,s.id,'subscription','paid','paid','unfulfilled',now(),w.week_start,p_amount-p_tax_cents-p_delivery_cents,p_amount,coalesce(s.included_credits_snapshot,s.plan_size),p_invoice_id,p_payment_intent_id,choices is null,c.address_line1,c.address_line2,c.city,c.zip,c.delivery_notes,coalesce(s.included_credits_snapshot,s.plan_size)) returning id into created_order;
 if choices is not null then
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select created_order,m.id,z.id,m.name,z.label,z.servings,i.quantity,0 from jsonb_to_recordset(choices) as i(meal_id uuid,meal_size_id uuid,quantity integer) join meals m on m.id=i.meal_id join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id;
 end if;
end $$;
revoke all on function public.prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer,integer) to service_role;
revoke all on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text,integer) from public,anon,authenticated;
grant execute on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text,integer) to service_role;
revoke all on function public.record_customer_subscription_invoice(text,text,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.record_customer_subscription_invoice(text,text,text,integer,integer,integer,integer) to service_role;
commit;
