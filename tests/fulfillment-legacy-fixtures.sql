-- Isolated test fixtures only. Apply before the fulfillment migration.
do $$ begin if current_database() not like 'netta_fulfillment%' then raise exception 'Use an isolated netta_fulfillment database.'; end if; end $$;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
update profiles set role='admin' where id='10000000-0000-4000-8000-000000000001';
insert into customers(id,auth_user_id,email) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','fulfillment@example.test'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','other@example.test');
insert into meals(id,slug,name,price_cents) values ('30000000-0000-4000-8000-000000000001','fulfillment-test','Historical meal',6000);
insert into meal_sizes(id,meal_id,label,servings,price_cents) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Half',2,6000);
insert into orders(id,customer_id,status,payment_status,fulfillment_status,paid_at,subtotal_cents,total_cents,deposit_cents,containers_issued,needs_meal_selection)
select ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001',
 case n when 1 then 'packing' when 2 then 'out_for_delivery' when 3 then 'delivered' when 4 then 'pending' when 7 then 'canceled' else 'paid' end,
 case n when 4 then 'unpaid' else 'paid' end,
 case n when 3 then 'delivered' when 7 then 'canceled' else 'unfulfilled' end,
 case when n in (1,4) then null else '2026-10-25T14:00:00Z'::timestamptz end,
 6000,6900,900,3,n=6 from generate_series(1,8) n;
insert into order_items(order_id,meal_id,meal_size_id,quantity,unit_price_cents,meal_name_snapshot,size_label_snapshot,servings_snapshot)
select id,'30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',3,2000,'Historical meal','Half',2 from orders where not needs_meal_selection;
insert into container_events(customer_id,order_id,kind,quantity,deposit_delta_cents,note)
values ('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','issued',3,900,'Historical delivery');
insert into holiday_orders(id,checkout_key,full_name,email,phone,occasion,event_date,fulfillment,people,entree,bread,dessert,settings_version,pricing_snapshot,food_cents,extra_cents,delivery_cents,total_cents,deposit_cents,balance_cents,consent_text,deposit_status,balance_status,fulfillment_status,delivered_at)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,gen_random_uuid(),'Holiday test','holiday@example.test','555','party','2026-12-24','delivery',18,'Turkey','Bread','Dessert',1,'{}',30000,0,1000,31000,31000,0,'Test consent',case n when 1 then 'pending' else 'paid' end,case n when 1 then 'unpaid' else 'paid' end,case n when 2 then 'delivered' else 'unfulfilled' end,case n when 2 then '2026-10-25T16:00:00Z'::timestamptz else null end from generate_series(1,3)n;
