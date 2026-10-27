-- Run only in the isolated netta_fulfillment test database after legacy fixtures and migration.
begin;
do $$ begin
 if current_database() not like 'netta_fulfillment%' then raise exception 'Use an isolated netta_fulfillment test database.'; end if;
 if (select fulfillment_status from orders where id='60000000-0000-4000-8000-000000000001')<>'unfulfilled' then raise exception 'Legacy packing was incorrectly considered packed'; end if;
 if (select fulfillment_status from orders where id='60000000-0000-4000-8000-000000000002')<>'packed' then raise exception 'Legacy delivery status was not normalized'; end if;
 if (select legacy_status from order_fulfillment_history where order_id='60000000-0000-4000-8000-000000000002')<>'out_for_delivery' then raise exception 'Legacy status was not preserved'; end if;
 if exists(select 1 from orders where packed_at is not null or delivered_at is not null) then raise exception 'Historical timestamps were invented'; end if;
 if (select delivered_at from holiday_orders where id='70000000-0000-4000-8000-000000000002')<>'2026-10-25T16:00:00Z'::timestamptz then raise exception 'Holiday timestamp changed'; end if;
 if exists(select 1 from order_notification_outbox) then raise exception 'Migration queued old customer emails'; end if;
 if (select count(*) from container_events)<>1 or (select containers_out from customers where id='20000000-0000-4000-8000-000000000001')<>3 then raise exception 'Historical container ledger changed'; end if;
end $$;

-- Duplicate payment notifications must not invent old milestones or send old confirmations.
update orders set payment_status='paid' where id='60000000-0000-4000-8000-000000000001';
update holiday_orders set deposit_status='paid',balance_status='paid' where id='70000000-0000-4000-8000-000000000003';
do $$ begin
 if (select confirmed_at from orders where id='60000000-0000-4000-8000-000000000001') is not null then raise exception 'Unknown weekly confirmation time invented'; end if;
 if (select confirmed_at from holiday_orders where id='70000000-0000-4000-8000-000000000003') is not null then raise exception 'Unknown holiday confirmation time invented'; end if;
 if exists(select 1 from order_notification_outbox) then raise exception 'Old payment replay queued a confirmation'; end if;
end $$;
set local role service_role;
do $$
declare a uuid:='10000000-0000-4000-8000-000000000001'; o uuid:='60000000-0000-4000-8000-000000000004'; p timestamptz; d timestamptz;
begin
 begin perform transition_order_fulfillment(o,'packed','10000000-0000-4000-8000-000000000002'); raise exception 'Non-admin accepted'; exception when raise_exception then if sqlerrm not like 'An administrator%' then raise; end if; end;
 begin perform transition_order_fulfillment(o,'out_for_delivery',a); raise exception 'Extra status accepted'; exception when raise_exception then if sqlerrm not like 'Invalid fulfillment%' then raise; end if; end;
 begin perform transition_order_fulfillment(o,'packed',a); raise exception 'Unpaid order packed'; exception when raise_exception then if sqlerrm not like 'Only paid orders%' then raise; end if; end;
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000005','delivered',a); raise exception 'Skipped Packed'; exception when raise_exception then if sqlerrm not like 'Only paid, packed%' then raise; end if; end;
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000006','packed',a); raise exception 'Missing selections packed'; exception when raise_exception then if sqlerrm not like 'The customer must choose meals%' then raise; end if; end;
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000007','packed',a); raise exception 'Canceled order reopened'; exception when raise_exception then if sqlerrm not like 'Completed or canceled%' then raise; end if; end;
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000005','canceled',a); raise exception 'Paid order canceled without refund'; exception when raise_exception then if sqlerrm not like 'Paid orders must use%' then raise; end if; end;
 update orders set status='paid',payment_status='paid',paid_at=now() where id=o;
 update orders set payment_status='paid' where id=o;
 if (select count(*) from order_fulfillment_history where order_id=o and to_status='unfulfilled')<>1 then raise exception 'Confirmation history duplicated'; end if;
 if (select count(*) from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id=o)<>1 then raise exception 'Confirmation queue duplicated'; end if;
 perform transition_order_fulfillment(o,'packed',a);
 select packed_at into p from orders where id=o;
 if p is null then raise exception 'Packing timestamp absent'; end if;
 perform transition_order_fulfillment(o,'packed',a);
 if (select packed_at from orders where id=o)<>p then raise exception 'Packing time changed on retry'; end if;
 perform transition_order_fulfillment(o,'delivered',a);
 select delivered_at into d from orders where id=o;
 perform transition_order_fulfillment(o,'delivered',a);
 if d is null or (select delivered_at from orders where id=o)<>d then raise exception 'Delivery timestamp absent or changed'; end if;
 if (select count(*) from order_fulfillment_history where order_id=o)<>3 then raise exception 'Milestones missing or duplicated'; end if;
 if (select count(*) from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id=o)<>3 then raise exception 'Notifications missing or duplicated'; end if;
 if (select count(*) from container_events where order_id=o and kind='issued')<>1 then raise exception 'Container issuance missing or duplicated'; end if;
 if (select containers_out from customers where id='20000000-0000-4000-8000-000000000001')<>6 or (select deposit_held_cents from customers where id='20000000-0000-4000-8000-000000000001')<>1800 then raise exception 'Container ledger balances incorrect'; end if;
 begin update order_fulfillment_history set occurred_at=now() where order_id=o; raise exception 'History editable'; exception when insufficient_privilege then null; end;
 begin update orders set packed_at=now()+interval '1 minute' where id=o; raise exception 'Timestamp editable'; exception when raise_exception then if sqlerrm not like 'Fulfillment timestamps%' then raise; end if; end;
end $$;
reset role;

-- A pending customer refund/edit blocks packing. Finalized customer refunds still cancel.
insert into customer_order_changes(id,request_key,order_id,customer_id,operation,old_total_cents,new_total_cents,paid,payload)
 values('80000000-0000-4000-8000-000000000001',gen_random_uuid(),'60000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000001','cancel',6900,0,true,'{}');
update orders set customer_change_id='80000000-0000-4000-8000-000000000001' where id='60000000-0000-4000-8000-000000000008';
set local role service_role;
do $$ begin
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000008','packed','10000000-0000-4000-8000-000000000001'); raise exception 'Pending refund ignored'; exception when raise_exception then if sqlerrm not like 'An order change is processing%' then raise; end if; end;
 perform finish_customer_order_change('80000000-0000-4000-8000-000000000001');
 if (select fulfillment_status from orders where id='60000000-0000-4000-8000-000000000008')<>'canceled' then raise exception 'Customer cancellation broken'; end if;
end $$;
reset role;

-- Holiday payment and both transitions use the same history/outbox, without container issues.
set local role service_role;
do $$ declare a uuid:='10000000-0000-4000-8000-000000000001'; o uuid:='70000000-0000-4000-8000-000000000001'; begin
 begin perform transition_order_fulfillment(o,'packed',a,'holiday'); raise exception 'Unpaid holiday packed'; exception when raise_exception then if sqlerrm not like 'Full payment%' then raise; end if; end;
 update holiday_orders set deposit_status='paid',balance_status='paid' where id=o;
 update holiday_orders set deposit_status='paid',balance_status='paid' where id=o;
 begin perform transition_order_fulfillment(o,'delivered',a,'holiday'); raise exception 'Holiday skipped Packed'; exception when raise_exception then if sqlerrm not like 'Holiday orders must move%' then raise; end if; end;
 perform transition_order_fulfillment(o,'packed',a,'holiday');
 perform transition_order_fulfillment(o,'packed',a,'holiday');
 perform transition_order_fulfillment(o,'delivered',a,'holiday');
 perform transition_order_fulfillment(o,'delivered',a,'holiday');
 if (select count(*) from order_fulfillment_history where holiday_order_id=o)<>3 then raise exception 'Holiday milestones missing or duplicated'; end if;
 if (select count(*) from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.holiday_order_id=o)<>3 then raise exception 'Holiday emails missing or duplicated'; end if;
 begin update holiday_orders set food_cents=food_cents+100 where id=o; raise exception 'Holiday snapshot mutable'; exception when raise_exception then if sqlerrm not like 'The accepted holiday%' then raise; end if; end;
end $$;
reset role;

-- A failed ledger insert must roll back status, history, and queued email together.
create function public.netta_test_reject_container() returns trigger language plpgsql as $$ begin raise exception 'Simulated ledger failure'; end $$;
create trigger netta_test_reject_container before insert on container_events for each row execute function public.netta_test_reject_container();
set local role service_role;
do $$ declare o uuid:='60000000-0000-4000-8000-000000000005'; a uuid:='10000000-0000-4000-8000-000000000001'; begin
 perform transition_order_fulfillment(o,'packed',a);
 begin perform transition_order_fulfillment(o,'delivered',a); raise exception 'Ledger failure ignored'; exception when raise_exception then if sqlerrm<>'Simulated ledger failure' then raise; end if; end;
 if (select fulfillment_status from orders where id=o)<>'packed' then raise exception 'Status not rolled back'; end if;
 if exists(select 1 from order_fulfillment_history where order_id=o and to_status='delivered') then raise exception 'History not rolled back'; end if;
 if exists(select 1 from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id=o and n.kind='delivered') then raise exception 'Email not rolled back'; end if;
end $$;
reset role;

-- Customers can read only their own safe milestone columns; private actor IDs/outbox stay private.
grant select on public.orders,public.customers,public.profiles to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from order_fulfillment_history) then raise exception 'Other customer history exposed'; end if;
 begin perform transition_order_fulfillment('60000000-0000-4000-8000-000000000005','packed','10000000-0000-4000-8000-000000000001'); raise exception 'Customer changed fulfillment'; exception when insufficient_privilege then null; end;
 begin perform actor_id from order_fulfillment_history; raise exception 'Admin identity exposed'; exception when insufficient_privilege then null; end;
 begin perform id from order_notification_outbox; raise exception 'Outbox exposed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin if not exists(select id from order_fulfillment_history) then raise exception 'Own history unavailable'; end if; end $$;
reset role;
rollback;
\echo 'PASS: historical preservation, three stages, payment guards, timestamps, retries, history, queues, containers, refunds, holiday snapshots, atomic rollback, and customer permissions.'
