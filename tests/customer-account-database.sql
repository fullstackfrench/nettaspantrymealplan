-- Run in an isolated test database after schema and the customer migrations.
begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into customers(id,auth_user_id,email,address_line1,city,zip) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','customer-one@example.test','1 Test St','Raleigh','27601'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','customer-two@example.test','2 Test St','Raleigh','27601');
insert into meals(id,slug,name,price_cents,is_available_for_subscription) values ('30000000-0000-4000-8000-000000000001','test-meal-one','Test Meal One',1000,true);
insert into meal_sizes(id,meal_id,label,price_cents,servings,is_available_for_subscription) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Regular',1000,1,true);
insert into weekly_menus(id,week_start,is_published) values ('50000000-0000-4000-8000-000000000001','2099-01-05',true);
insert into weekly_menu_items(menu_id,meal_id) values ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into orders(id,customer_id,created_at,total_cents,subtotal_cents,containers_issued,deposit_cents) values ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',now()-interval '2 hours',1300,1000,1,300),('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',now()-interval '24 hours',1300,1000,1,300);
insert into order_items(order_id,meal_id,meal_size_id,quantity,unit_price_cents) values ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,1000);
do $$
declare change customer_order_changes%rowtype; repeat_change customer_order_changes%rowtype; items jsonb; addr jsonb;
begin
 items:='[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":2}]';
 addr:='{"address_line1":"3 Test St","city":"Raleigh","zip":"27601"}';
 begin perform begin_customer_order_change('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','cancel','[]','{}');raise exception 'Ownership guard failed';exception when raise_exception then if sqlerrm not like 'Order not found%' then raise;end if;end;
 begin perform begin_customer_order_change('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','cancel','[]','{}');raise exception 'Deadline guard failed';exception when raise_exception then if sqlerrm not like 'The 24-hour%' then raise;end if;end;
 change:=begin_customer_order_change('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','edit',items,addr);
 if change.new_total_cents<>2600 then raise exception 'Pricing failed';end if;
 if (select total_cents from orders where id=change.order_id)<>1300 then raise exception 'Change applied before settlement';end if;
 repeat_change:=begin_customer_order_change('10000000-0000-4000-8000-000000000001',change.order_id,change.request_key,'edit',items,addr);
 if repeat_change.id<>change.id then raise exception 'Idempotency failed';end if;
 begin perform begin_customer_order_change('10000000-0000-4000-8000-000000000001',change.order_id,change.request_key,'cancel','[]','{}');raise exception 'Conflicting retry accepted';exception when raise_exception then if sqlerrm not like 'This request key%' then raise;end if;end;
 begin update orders set status='packing' where id=change.order_id;raise exception 'Preparation guard failed';exception when raise_exception then if sqlerrm not like 'An order change is processing%' then raise;end if;end;
 perform finish_customer_order_change(change.id);
 perform finish_customer_order_change(change.id);
 if (select total_cents from orders where id=change.order_id)<>2600 or (select sum(quantity) from order_items where order_id=change.order_id)<>2 then raise exception 'Atomic item update failed';end if;
 if (select delivery_address_line1 from orders where id=change.order_id)<>'3 Test St' then raise exception 'Address update failed';end if;
 update meal_sizes set price_cents=2000,is_active=false where id='40000000-0000-4000-8000-000000000001';
 change:=begin_customer_order_change('10000000-0000-4000-8000-000000000001',change.order_id,'70000000-0000-4000-8000-000000000005','edit',items,addr);
 if change.new_total_cents<>2600 then raise exception 'Address-only edit repriced existing meals';end if;
 perform finish_customer_order_change(change.id);
 update meal_sizes set price_cents=1000,is_active=true where id='40000000-0000-4000-8000-000000000001';
 change:=begin_customer_order_change('10000000-0000-4000-8000-000000000001',change.order_id,'70000000-0000-4000-8000-000000000004','cancel','[]','{}');
 perform finish_customer_order_change(change.id);
 if (select status from orders where id=change.order_id)<>'canceled' then raise exception 'Cancellation failed';end if;
 if has_function_privilege('authenticated','begin_customer_order_change(uuid,uuid,uuid,text,jsonb,jsonb)','execute') or has_function_privilege('anon','finish_customer_order_change(uuid)','execute') then raise exception 'Customer can bypass server controls';end if;
 raise notice 'PASS: ownership, exact 24-hour cutoff, authoritative prices, reservation, idempotency, atomic order/address updates, cancellation and RPC permissions';
end $$;

insert into orders(id,customer_id,created_at,order_type,total_cents,subtotal_cents,containers_issued,deposit_cents) values ('60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001',now(),'subscription',2600,2000,2,600);
insert into order_items(order_id,meal_id,meal_size_id,quantity,unit_price_cents) values ('60000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',2,0);
select record_customer_checkout_payment('60000000-0000-4000-8000-000000000003','cs_test','pi_test','cus_test','sub_test','price_test',2000);
select record_customer_checkout_payment('60000000-0000-4000-8000-000000000003','cs_test','pi_test','cus_test','sub_test','price_test',2000);
do $$
declare sub_id uuid; choices jsonb; generated orders%rowtype;
begin
 select id into sub_id from subscriptions where stripe_subscription_id='sub_test';
 if (select count(*) from subscriptions where stripe_subscription_id='sub_test')<>1 then raise exception 'Duplicate subscription';end if;
 choices:='[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":2}]';
 begin perform save_customer_week_choices('10000000-0000-4000-8000-000000000002',sub_id,'50000000-0000-4000-8000-000000000001',choices);raise exception 'Choices ownership guard failed';exception when raise_exception then if sqlerrm not like 'Subscription not found%' then raise;end if;end;
 perform save_customer_week_choices('10000000-0000-4000-8000-000000000001',sub_id,'50000000-0000-4000-8000-000000000001',choices);
 perform record_customer_subscription_invoice('in_test_one','sub_test','pi_test_renewal',2000);
 perform record_customer_subscription_invoice('in_test_one','sub_test','pi_test_renewal',2000);
 select * into generated from orders where stripe_invoice_id='in_test_one';
 if generated.status<>'paid' or generated.needs_meal_selection or (select sum(quantity) from order_items where order_id=generated.id)<>2 then raise exception 'Renewal selections failed';end if;
 if (select count(*) from orders where stripe_invoice_id='in_test_one')<>1 then raise exception 'Duplicate renewal';end if;
 update subscriptions set included_credits_snapshot=3 where id=sub_id;
 perform record_customer_subscription_invoice('in_test_two','sub_test','pi_test_renewal_two',3000);
 select * into generated from orders where stripe_invoice_id='in_test_two';
 if not generated.needs_meal_selection then raise exception 'Stale selections were accepted after plan change';end if;
 begin update orders set status='packing' where id=generated.id;raise exception 'Incomplete order prepared';exception when raise_exception then if sqlerrm not like 'The customer must choose meals%' then raise;end if;end;
 raise notice 'PASS: subscription synchronization, customer-owned choices, renewal order creation, repeat invoices and selection validation after plan changes';
end $$;


do $$
declare guest_one record; guest_two record;
begin
 select * into guest_one from prepare_checkout_order('80000000-0000-4000-8000-000000000001',repeat('a',64),'one_time',null,'Guest One','guest@example.test','27601',null,null,'[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":1}]',300,0);
 select * into guest_two from prepare_checkout_order('80000000-0000-4000-8000-000000000002',repeat('b',64),'one_time',null,'Guest One','guest@example.test','27601',null,null,'[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":1}]',300,0);
 if guest_one.total_cents<>1300 or (select customer_id from orders where id=guest_one.order_id) is distinct from (select customer_id from orders where id=guest_two.order_id) then raise exception 'Returning guest checkout failed';end if;
 select * into guest_two from prepare_checkout_order('80000000-0000-4000-8000-000000000003',repeat('c',64),'one_time',null,'Customer One','customer-one@example.test','27601',null,null,'[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":1}]',300,0);
 if guest_two.total_cents<>1300 then raise exception 'Guest checkout with account email failed';end if;
 update weekly_menu_items set sold_out=true where menu_id='50000000-0000-4000-8000-000000000001';
 begin perform prepare_checkout_order('80000000-0000-4000-8000-000000000004',repeat('d',64),'one_time',null,'Guest','unavailable@example.test','27601',null,null,'[{"meal_id":"30000000-0000-4000-8000-000000000001","meal_size_id":"40000000-0000-4000-8000-000000000001","quantity":1}]',300,0);raise exception 'Sold-out checkout allowed';exception when raise_exception then if sqlerrm not like 'One or more selected%' then raise;end if;end;
 raise notice 'PASS: new and returning guest checkout, guest checkout with account email, authoritative container deposits and sold-out meal validation';
end $$;

rollback;
