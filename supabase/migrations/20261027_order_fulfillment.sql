-- Apply after all 20261024 migrations, in a transaction, before the new admin UI.
-- No prices, payment totals, or existing container ledger entries are rewritten.
begin;

alter table public.orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists packed_at timestamptz,
  add column if not exists delivered_at timestamptz;
alter table public.holiday_orders
  add column if not exists confirmed_at timestamptz,
  add column if not exists packed_at timestamptz;

create table if not exists public.order_fulfillment_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete restrict,
  holiday_order_id uuid references public.holiday_orders(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('unfulfilled','packed','delivered','canceled')),
  occurred_at timestamptz,
  recorded_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  is_historical boolean not null default false,
  legacy_status text,
  legacy_fulfillment_status text,
  check (num_nonnulls(order_id,holiday_order_id)=1)
);
create unique index if not exists weekly_fulfillment_milestone_uidx
  on public.order_fulfillment_history(order_id,to_status) where order_id is not null;
create unique index if not exists holiday_fulfillment_milestone_uidx
  on public.order_fulfillment_history(holiday_order_id,to_status) where holiday_order_id is not null;
alter table public.order_fulfillment_history enable row level security;
revoke all on public.order_fulfillment_history from public, anon, authenticated, service_role;
grant select,insert on public.order_fulfillment_history to service_role;
grant select(id,order_id,holiday_order_id,from_status,to_status,occurred_at,recorded_at,is_historical)
  on public.order_fulfillment_history to authenticated;
create policy "customers read own fulfillment history" on public.order_fulfillment_history
  for select to authenticated using (exists (
    select 1 from public.orders o join public.customers c on c.id=o.customer_id
    where o.id=order_id and c.auth_user_id=auth.uid()
  ));

-- Step 4 queues notifications only. Step 5 adds delivery and retry processing.
create table if not exists public.order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.order_fulfillment_history(id),
  kind text not null check (kind in ('confirmed','packed','delivered')),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check (attempts>=0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.order_notification_outbox enable row level security;
revoke all on public.order_notification_outbox from public,anon,authenticated,service_role;
grant select,insert,update on public.order_notification_outbox to service_role;
create index if not exists order_notifications_pending_idx
  on public.order_notification_outbox(available_at) where status in ('pending','failed');

-- Allow only the new tracking fields through the holiday snapshot guard.
create or replace function public.guard_holiday_order_snapshot() returns trigger
language plpgsql set search_path=public as $$
declare mutable_fields text[] := array[
 'deposit_status','fulfillment_status','balance_status','stripe_customer_id',
 'stripe_checkout_session_id','stripe_deposit_intent_id','stripe_payment_method_id',
 'stripe_balance_invoice_id','invoice_url','payment_error','delivered_at',
 'billing_lease_until','confirmed_at','packed_at'];
begin
 if (to_jsonb(new)-mutable_fields) is distinct from (to_jsonb(old)-mutable_fields) then
  raise exception 'The accepted holiday order and pricing cannot be changed';
 end if;
 if old.deposit_status='paid' and new.deposit_status<>'paid' then raise exception 'A paid holiday deposit cannot be downgraded'; end if;
 if old.balance_status='paid' and new.balance_status<>'paid' then raise exception 'A paid holiday balance cannot be downgraded'; end if;
 return new;
end $$;

-- Snapshot the original statuses before normalization. Unknown times remain NULL.
insert into public.order_fulfillment_history(order_id,to_status,occurred_at,is_historical,legacy_status,legacy_fulfillment_status)
select id,case
 when status='canceled' or fulfillment_status='canceled' then 'canceled'
 when status='delivered' or fulfillment_status='delivered' then 'delivered'
 when status='out_for_delivery' or fulfillment_status='out_for_delivery' then 'packed'
 else 'unfulfilled' end,
 case when status not in ('canceled','delivered','out_for_delivery') and fulfillment_status not in ('canceled','delivered','out_for_delivery') then paid_at else null end,
 true,status,fulfillment_status
from public.orders
where payment_status in ('paid','partially_refunded','refunded') or status in ('canceled','delivered','out_for_delivery','packing')
on conflict do nothing;
insert into public.order_fulfillment_history(holiday_order_id,to_status,occurred_at,is_historical,legacy_fulfillment_status)
select id,fulfillment_status,case when fulfillment_status='delivered' then delivered_at else null end,true,fulfillment_status
from public.holiday_orders where deposit_status='paid' or fulfillment_status='delivered'
on conflict do nothing;

-- Existing packing meant work in progress, not packed. Out-for-delivery proves packing ended.
alter table public.orders disable trigger guard_customer_order_change;
alter table public.orders drop constraint if exists orders_fulfillment_status_check;
update public.orders set
 fulfillment_status=case
  when status='canceled' or fulfillment_status='canceled' then 'canceled'
  when status='delivered' or fulfillment_status='delivered' then 'delivered'
  when status='out_for_delivery' or fulfillment_status='out_for_delivery' then 'packed'
  else 'unfulfilled' end,
 status=case
  when status='canceled' or fulfillment_status='canceled' then 'canceled'
  when status='delivered' or fulfillment_status='delivered' then 'delivered'
  when status='out_for_delivery' or fulfillment_status='out_for_delivery' then 'packing'
  else status end,
 confirmed_at=paid_at;
alter table public.orders enable trigger guard_customer_order_change;
alter table public.orders add constraint orders_fulfillment_status_check
 check(fulfillment_status in ('unfulfilled','packed','delivered','canceled'));
alter table public.holiday_orders drop constraint if exists holiday_orders_fulfillment_status_check;
alter table public.holiday_orders add constraint holiday_orders_fulfillment_status_check
 check(fulfillment_status in ('unfulfilled','packed','delivered','canceled'));

-- Do not silently delete or merge historical ledger entries if duplicates exist.
lock table public.container_events in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.container_events where kind='issued' and order_id is not null group by order_id having count(*)>1) then
  raise exception 'Duplicate container issuance exists. Review the ledger before applying fulfillment tracking; no ledger entries have been changed.';
 end if;
end $$;
create unique index if not exists container_events_one_issuance_per_order_uidx
 on public.container_events(order_id) where kind='issued' and order_id is not null;

create or replace function public.validate_weekly_fulfillment() returns trigger
language plpgsql set search_path=public as $$
declare actor uuid := nullif(current_setting('netta.fulfillment_actor',true),'')::uuid;
 admin_action boolean := false;
 paid boolean := new.payment_status in ('paid','partially_refunded');
begin
 if actor is not null then
  select exists(select 1 from profiles where id=actor and role='admin') into admin_action;
 end if;
 if tg_op='INSERT' then
  if new.fulfillment_status<>'unfulfilled' or new.status not in ('pending','paid') then raise exception 'New orders must begin awaiting packing.'; end if;
  new.packed_at:=null; new.delivered_at:=null;
  new.confirmed_at:=case when paid then coalesce(new.paid_at,now()) else null end;
  return new;
 end if;
 if old.fulfillment_status in ('delivered','canceled') and new.fulfillment_status<>old.fulfillment_status then raise exception 'Completed or canceled orders cannot be reopened.'; end if;
 if old.customer_change_id is not null and new.fulfillment_status is distinct from old.fulfillment_status and new.fulfillment_status<>'canceled' then raise exception 'An order change is processing. Finish it before changing fulfillment status.'; end if;
 if new.fulfillment_status is distinct from old.fulfillment_status then
  if new.fulfillment_status='packed' then
   if not admin_action then raise exception 'An administrator must confirm fulfillment.'; end if;
   if old.fulfillment_status<>'unfulfilled' or not paid or new.status='canceled' then raise exception 'Only paid orders needing packing can be marked packed.'; end if;
   if new.needs_meal_selection or not exists(select 1 from order_items where order_id=new.id) then raise exception 'The customer must choose meals before this order can be packed.'; end if;
   new.status:='packing'; new.packed_at:=now();
  elsif new.fulfillment_status='delivered' then
   if not admin_action then raise exception 'An administrator must confirm fulfillment.'; end if;
   if old.fulfillment_status<>'packed' or not paid then raise exception 'Only paid, packed orders can be marked delivered.'; end if;
   new.status:='delivered'; new.delivered_at:=now();
  elsif new.fulfillment_status='canceled' then
   if old.fulfillment_status='delivered' then raise exception 'Delivered orders cannot be canceled.'; end if;
   if old.payment_status='processing' then raise exception 'Payment is processing. Refresh the order before canceling.'; end if;
   if old.payment_status in ('paid','partially_refunded') and not (
    old.customer_change_id is not null and new.customer_change_id is null
    and exists(select 1 from customer_order_changes where id=old.customer_change_id and operation='cancel')
   ) then raise exception 'Paid orders must use the existing cancellation and refund process.'; end if;
   if old.customer_change_id is not null and new.customer_change_id is not null then raise exception 'An order change is processing.'; end if;
   new.status:='canceled';
  else raise exception 'Invalid fulfillment transition.';
  end if;
 else
  if new.packed_at is distinct from old.packed_at or new.delivered_at is distinct from old.delivered_at then raise exception 'Fulfillment timestamps cannot be changed independently.'; end if;
  if new.status is distinct from old.status and new.status in ('packing','out_for_delivery','delivered','canceled') then raise exception 'Use the fulfillment actions to change order status.'; end if;
 end if;
 if old.confirmed_at is not null then new.confirmed_at:=old.confirmed_at;
 elsif paid and old.payment_status not in ('paid','partially_refunded','refunded') and new.fulfillment_status<>'canceled' then new.confirmed_at:=coalesce(new.paid_at,now());
 else new.confirmed_at:=old.confirmed_at; end if;
 return new;
end $$;
create trigger validate_weekly_fulfillment before insert or update on public.orders
 for each row execute function public.validate_weekly_fulfillment();

create or replace function public.validate_holiday_fulfillment() returns trigger
language plpgsql set search_path=public as $$
declare actor uuid := nullif(current_setting('netta.fulfillment_actor',true),'')::uuid;
 admin_action boolean := false;
 paid boolean := new.deposit_status='paid' and new.balance_status='paid' and new.balance_cents=0;
begin
 if actor is not null then select exists(select 1 from profiles where id=actor and role='admin') into admin_action; end if;
 if tg_op='INSERT' then
  if new.fulfillment_status<>'unfulfilled' then raise exception 'New holiday orders must begin awaiting packing.'; end if;
  new.packed_at:=null; new.delivered_at:=null; new.confirmed_at:=case when paid then now() else null end;
  return new;
 end if;
 if new.fulfillment_status is distinct from old.fulfillment_status then
  if not admin_action then raise exception 'An administrator must confirm fulfillment.'; end if;
  if not paid then raise exception 'Full payment is required before fulfillment.'; end if;
  if old.fulfillment_status='unfulfilled' and new.fulfillment_status='packed' then new.packed_at:=now();
  elsif old.fulfillment_status='packed' and new.fulfillment_status='delivered' then new.delivered_at:=now();
  else raise exception 'Holiday orders must move from Needs Packing to Packed to Delivered.'; end if;
 elsif new.packed_at is distinct from old.packed_at or new.delivered_at is distinct from old.delivered_at then raise exception 'Fulfillment timestamps cannot be changed independently.';
 end if;
 if old.confirmed_at is not null then new.confirmed_at:=old.confirmed_at;
 elsif paid and not (old.deposit_status='paid' and old.balance_status='paid' and old.balance_cents=0) then new.confirmed_at:=now(); else new.confirmed_at:=old.confirmed_at; end if;
 return new;
end $$;
create trigger validate_holiday_fulfillment before insert or update on public.holiday_orders
 for each row execute function public.validate_holiday_fulfillment();

create or replace function public.record_fulfillment_change() returns trigger
language plpgsql set search_path=public as $$
declare
 weekly boolean := tg_table_name='orders';
 old_state text; event_id uuid; stamp timestamptz; notification text;
 actor uuid := nullif(current_setting('netta.fulfillment_actor',true),'')::uuid;
 confirmed boolean := new.confirmed_at is not null;
begin
 if tg_op='UPDATE' then old_state:=old.fulfillment_status; end if;
 -- Confirmation is recorded once after verified payment, including invoice-created renewals.
 if confirmed and (tg_op='INSERT' or old.confirmed_at is null) then
  insert into order_fulfillment_history(order_id,holiday_order_id,to_status,occurred_at)
  values(case when weekly then new.id end,case when not weekly then new.id end,'unfulfilled',new.confirmed_at)
  on conflict do nothing returning id into event_id;
  if event_id is not null then insert into order_notification_outbox(event_id,kind) values(event_id,'confirmed') on conflict do nothing; end if;
 end if;
 if tg_op='UPDATE' and new.fulfillment_status is distinct from old_state then
  stamp:=case new.fulfillment_status when 'packed' then new.packed_at when 'delivered' then new.delivered_at else now() end;
  insert into order_fulfillment_history(order_id,holiday_order_id,from_status,to_status,occurred_at,actor_id)
  values(case when weekly then new.id end,case when not weekly then new.id end,old_state,new.fulfillment_status,stamp,actor)
  returning id into event_id;
  if new.fulfillment_status in ('packed','delivered') then
   insert into order_notification_outbox(event_id,kind) values(event_id,new.fulfillment_status);
  end if;
  if weekly then
  if new.fulfillment_status='delivered' and new.containers_issued>0 then
   insert into container_events(customer_id,order_id,kind,quantity,deposit_delta_cents,note)
    select new.customer_id,new.id,'issued',new.containers_issued,new.deposit_cents,'Delivered'
    where not exists(select 1 from container_events where order_id=new.id and kind='issued')
    on conflict (order_id) where kind='issued' and order_id is not null do nothing;
  end if;
  end if;
 end if;
 return new;
end $$;
create trigger record_weekly_fulfillment after insert or update on public.orders
 for each row execute function public.record_fulfillment_change();
create trigger record_holiday_fulfillment after insert or update on public.holiday_orders
 for each row execute function public.record_fulfillment_change();

create or replace function public.transition_order_fulfillment(p_order_id uuid,p_to_status text,p_actor_id uuid,p_kind text default 'weekly')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_state text; result jsonb;
begin
 if not exists(select 1 from profiles where id=p_actor_id and role='admin') then raise exception 'An administrator must confirm fulfillment.'; end if;
 if p_to_status not in ('packed','delivered','canceled') or p_to_status is null then raise exception 'Invalid fulfillment action.'; end if;
 if p_kind='weekly' then
  select fulfillment_status into current_state from orders where id=p_order_id for update;
 elsif p_kind='holiday' then
  select fulfillment_status into current_state from holiday_orders where id=p_order_id for update;
 else raise exception 'Invalid order type.';
 end if;
 if current_state is null then raise exception 'Order not found.'; end if;
 if current_state=p_to_status then return jsonb_build_object('changed',false,'fulfillment_status',current_state); end if;
 perform set_config('netta.fulfillment_actor',p_actor_id::text,true);
 if p_kind='weekly' then
  update orders set fulfillment_status=p_to_status where id=p_order_id
   returning jsonb_build_object('changed',true,'fulfillment_status',fulfillment_status,'confirmed_at',confirmed_at,'packed_at',packed_at,'delivered_at',delivered_at) into result;
 else
  update holiday_orders set fulfillment_status=p_to_status where id=p_order_id
   returning jsonb_build_object('changed',true,'fulfillment_status',fulfillment_status,'confirmed_at',confirmed_at,'packed_at',packed_at,'delivered_at',delivered_at) into result;
 end if;
 perform set_config('netta.fulfillment_actor','',true);
 return result;
end $$;
revoke all on function public.transition_order_fulfillment(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.transition_order_fulfillment(uuid,text,uuid,text) to service_role;

commit;
