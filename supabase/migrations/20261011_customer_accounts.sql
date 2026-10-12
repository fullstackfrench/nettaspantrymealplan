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

commit;
