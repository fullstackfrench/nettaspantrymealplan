-- Approved synthetic fixture only. No checkout, authentication, Stripe, or email API calls.
-- Run only after reviewing preflight.sql and confirming no outbound sender is active.
begin;
set local statement_timeout='15s';
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtext('netta-step4-fixture-9e716037-4456-44dd-9f68-1cb6469eab95'));
do $$
declare subtotal integer; tax integer;
begin
 if exists(select 1 from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' or email='step4-fulfillment-9e716037@example.invalid') or exists(select 1 from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95') then
  raise exception 'Test identity already exists. Stop and inspect; this script never overwrites records.';
 end if;
 if exists(select 1 from order_notification_outbox where status in ('processing','sent')) then
  raise exception 'A notification sender may be active. Stop before creating test records.';
 end if;
 if exists(
  select 1 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace
  where n.nspname='public' and not t.tgisinternal
  and r.relname in ('customers','orders','order_items','admin_order_notes','order_fulfillment_history','order_notification_outbox','container_events')
  and t.tgname not in ('customer_nc_address','guard_customer_order_change','validate_weekly_fulfillment','record_weekly_fulfillment','admin_order_note_updated','container_event_applied')
 ) then raise exception 'Unexpected database trigger. Audit outbound integrations before creating the fixture.'; end if;
 if exists(
  select 1 from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace join pg_proc f on f.oid=t.tgfoid
  where n.nspname='public' and not t.tgisinternal
  and r.relname in ('customers','orders','order_items','admin_order_notes','order_fulfillment_history','order_notification_outbox','container_events')
  and md5(f.prosrc) not in ('1c4318bee4240d4113d86fad7eb15623','42418a1db12054967f1cb4195ee1cbee','a161d6de374f76164e954568ebaa67e2','62b58f171dd1a5d459e6a0b3a3077cea','001cdca6ed878916df83b37d5ecde112','f073013e87a7d10a2db4cc3ce569caa7')
 ) then raise exception 'Trigger code changed since the read-only audit. Stop and review.'; end if;
 if to_regclass('cron.job') is not null or exists(select 1 from pg_extension where extname='pg_net') then
  raise exception 'Scheduler/network extension configuration changed. Re-audit before creating the fixture.';
 end if;
 if (select count(*) from meal_sizes s join meals m on m.id=s.meal_id where s.id in ('3d8e9ffb-36e1-49a0-bc13-0ef44dbc75ae','96795a39-69a8-41df-885d-1631e46a5ad3') and s.is_active and m.is_active
  and ((s.id='3d8e9ffb-36e1-49a0-bc13-0ef44dbc75ae' and s.label='Half' and s.servings=2 and s.price_cents=800)
    or (s.id='96795a39-69a8-41df-885d-1631e46a5ad3' and s.label='Whole' and s.servings=4 and s.price_cents=4600)))<>2 then
  raise exception 'Meal portions or prices changed. Re-review the fixture before proceeding.';
 end if;
 subtotal:=6200;
 tax:=round(subtotal::numeric*825/10000)::integer+round(5000::numeric*825/10000)::integer;
 insert into customers(id,email,full_name,phone,address_line1,address_line2,city,state,zip,delivery_notes,glass_fee_paid_at,glass_fee_order_id)
 values('7825c77e-1bcd-44bd-8b0e-a05d8c25d266','step4-fulfillment-9e716037@example.invalid','TEST ONLY — Step 4 Fulfillment 9e716037',null,'TEST ONLY — DO NOT DELIVER','Synthetic fulfillment verification','Test City','NC','27601','TEST ONLY. Do not prepare, deliver, charge, or refund.',now(),'9e716037-4456-44dd-9f68-1cb6469eab95');
 insert into orders(id,customer_id,order_type,status,payment_status,fulfillment_status,paid_at,contact_name,contact_email,delivery_address_line1,delivery_address_line2,delivery_city,delivery_zip,delivery_notes,subtotal_cents,tax_cents,tax_rate_bps,glass_fee_cents,deposit_cents,deposit_rate_cents,delivery_fee_cents,total_cents,containers_issued,containers_returned,needs_meal_selection)
 values('9e716037-4456-44dd-9f68-1cb6469eab95','7825c77e-1bcd-44bd-8b0e-a05d8c25d266','one_time','paid','paid','unfulfilled',now(),'TEST ONLY — Step 4 Fulfillment 9e716037','step4-fulfillment-9e716037@example.invalid','TEST ONLY — DO NOT DELIVER','Synthetic fulfillment verification','Test City','27601','TEST ONLY. Synthetic paid status; no funds collected. Do not prepare, deliver, charge, or refund.',subtotal,tax,825,5000,0,0,0,subtotal+5000+tax,3,0,false);
 insert into order_items(id,order_id,meal_id,meal_size_id,quantity,unit_price_cents,meal_name_snapshot,size_label_snapshot,servings_snapshot)
 select case s.id when '3d8e9ffb-36e1-49a0-bc13-0ef44dbc75ae' then 'cde7dd3f-d014-459f-ab45-8e842166e028'::uuid else '27981cb9-3fdf-4993-834e-cfdb3b453e69'::uuid end,
 '9e716037-4456-44dd-9f68-1cb6469eab95',s.meal_id,s.id,case s.id when '3d8e9ffb-36e1-49a0-bc13-0ef44dbc75ae' then 2 else 1 end,s.price_cents,meal.name,s.label,s.servings
 from meal_sizes s join meals meal on meal.id=s.meal_id where s.id in ('3d8e9ffb-36e1-49a0-bc13-0ef44dbc75ae','96795a39-69a8-41df-885d-1631e46a5ad3');
 insert into admin_order_notes(order_id,note) values('9e716037-4456-44dd-9f68-1cb6469eab95','TEST ONLY — STEP 4 FULFILLMENT. Synthetic customer and paid status; no money collected. Do not cook, deliver, charge, or refund. Remove this fixture and its queued notifications before enabling Step 5 email delivery.');
 -- Preserve proof that confirmation was queued, but make it ineligible for scheduled delivery.
 update order_notification_outbox n set available_at='infinity'::timestamptz
 from order_fulfillment_history h where h.id=n.event_id and h.order_id='9e716037-4456-44dd-9f68-1cb6469eab95';
 if (select count(*) from order_items where order_id='9e716037-4456-44dd-9f68-1cb6469eab95')<>2
 or (select sum(quantity) from order_items where order_id='9e716037-4456-44dd-9f68-1cb6469eab95')<>3
 or exists(select 1 from container_events where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266')
 or (select containers_out from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266')<>0
 or (select deposit_held_cents from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266')<>0
 or (select fulfillment_status from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95')<>'unfulfilled'
 or (select confirmed_at from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95') is null
 or (select count(*) from order_fulfillment_history where order_id='9e716037-4456-44dd-9f68-1cb6469eab95' and to_status='unfulfilled')<>1
 or (select count(*) from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id='9e716037-4456-44dd-9f68-1cb6469eab95' and n.status='pending' and n.available_at='infinity'::timestamptz and n.attempts=0)<>1
 then raise exception 'Fixture verification failed; all changes rolled back.'; end if;
end $$;
select '9e716037-4456-44dd-9f68-1cb6469eab95' as order_id,'7825c77e-1bcd-44bd-8b0e-a05d8c25d266' as customer_id,'created' as result;
commit;
