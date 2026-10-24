\set ON_ERROR_STOP on
begin;
update meal_ordering_settings set checkout_enabled=true where id=1;
insert into auth.users(id) values ('91000000-0000-4000-8000-000000000001'),('91000000-0000-4000-8000-000000000002'),('91000000-0000-4000-8000-000000000003');
insert into customers(id,auth_user_id,email,full_name,zip) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','new-policy@example.test','New Customer','27601'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','legacy-policy@example.test','Previously Paid','28909'),
 ('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000003','imposter-policy@example.test','Previously Paid','27006');
insert into glass_deposit_credits(email,full_name) values ('legacy-policy@example.test','Previously Paid');
insert into meals(id,slug,name,price_cents,tags) values('93000000-0000-4000-8000-000000000001','policy-test-meal','Meal',6000,array['main-dishes']);
insert into meal_sizes(id,meal_id,label,price_cents,servings) values('94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Standard',6000,1);
insert into weekly_menus(id,week_start,is_published) values('95000000-0000-4000-8000-000000000001','2099-01-05',true);
insert into weekly_menu_items(menu_id,meal_id) values('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001');
do $$
declare
 items jsonb:='[{"meal_id":"93000000-0000-4000-8000-000000000001","meal_size_id":"94000000-0000-4000-8000-000000000001","quantity":1}]';
 first_order record; next_order record; credited record; named record; change customer_order_changes%rowtype;
 addr jsonb:='{"address_line1":"1 Test St","city":"Raleigh","zip":"27601"}';
begin
 if not weekly_menu_accepts_orders('2026-10-26','2026-10-26T23:59:59Z') or weekly_menu_accepts_orders('2026-10-26','2026-10-27T00:00:00Z') then raise exception 'Eastern daylight cutoff failed'; end if;
 if not weekly_menu_accepts_orders('2026-01-12','2026-01-13T00:59:59Z') or weekly_menu_accepts_orders('2026-01-12','2026-01-13T01:00:00Z') then raise exception 'Eastern standard cutoff failed'; end if;
 if not is_nc_delivery_zip('27006') or not is_nc_delivery_zip('28909') or is_nc_delivery_zip('29601') or is_nc_delivery_zip('27601bad') then raise exception 'NC boundary failed'; end if;
 select * into first_order from prepare_checkout_order(gen_random_uuid(),repeat('a',64),'one_time',null,'New Customer','new-policy@example.test','27601','91000000-0000-4000-8000-000000000001','new-policy@example.test',items,300,1000,825);
 if (select tax_cents from orders where id=first_order.order_id)<>991 then raise exception 'Initial tax incorrect'; end if;
 if first_order.total_cents<>12991 or first_order.deposit_cents<>0 then raise exception 'First order must charge exactly one non-refundable $50 fee'; end if;
 begin
  perform prepare_checkout_order(gen_random_uuid(),repeat('b',64),'one_time',null,'New Customer','new-policy@example.test','27601','91000000-0000-4000-8000-000000000001','new-policy@example.test',items,300,1000,825);
  raise exception 'Duplicate unpaid fee reservation accepted';
 exception when raise_exception then if sqlerrm='Duplicate unpaid fee reservation accepted' then raise; end if; end;
 perform record_customer_checkout_payment(first_order.order_id,'cs_policy','pi_policy','cus_policy',null,null,null);
 if (select glass_fee_paid_at from customers where id='92000000-0000-4000-8000-000000000001') is null then raise exception 'Payment did not record once-only charge'; end if;
 select * into next_order from prepare_checkout_order(gen_random_uuid(),repeat('c',64),'one_time',null,'New Customer','new-policy@example.test','27601','91000000-0000-4000-8000-000000000001','new-policy@example.test',items,300,1000,825);
 if next_order.total_cents<>7578 then raise exception 'Returning customer was charged again'; end if;
 change:=begin_customer_order_change('91000000-0000-4000-8000-000000000001',first_order.order_id,gen_random_uuid(),'edit',jsonb_set(items,'{0,quantity}','2'),addr);
 if change.new_total_cents<>19486 then raise exception 'Edit changed the one-time fee'; end if;
 perform finish_customer_order_change(change.id);
 if (select tax_cents from orders where id=first_order.order_id)<>1486 then raise exception 'Edit tax incorrect'; end if;
 if (select subtotal_cents from orders where id=first_order.order_id)<>12000 then raise exception 'Fee included in food subtotal'; end if;
 change:=begin_customer_order_change('91000000-0000-4000-8000-000000000001',first_order.order_id,gen_random_uuid(),'cancel','[]','{}');
 if change.new_total_cents<>5413 then raise exception 'Cancellation refunded the non-refundable fee'; end if;
 perform finish_customer_order_change(change.id);
 if (select payment_status from orders where id=first_order.order_id)<>'partially_refunded' then raise exception 'Cancellation payment status incorrect'; end if;
 begin
  perform prepare_checkout_order(gen_random_uuid(),repeat('d',64),'one_time',null,'Guest','new-policy@example.test','27601',null,null,items,300,1000,825);
  raise exception 'Anonymous caller claimed an account benefit';
 exception when raise_exception then if sqlerrm='Anonymous caller claimed an account benefit' then raise; end if; end;
 select * into credited from prepare_checkout_order(gen_random_uuid(),repeat('e',64),'one_time',null,'Previously Paid','legacy-policy@example.test','28909','91000000-0000-4000-8000-000000000002','legacy-policy@example.test',items,300,1000,825);
 if credited.total_cents<>7578 then raise exception 'Pre-registered legacy payment not honored'; end if;
 select * into named from prepare_checkout_order(gen_random_uuid(),repeat('f',64),'one_time',null,'Previously Paid','imposter-policy@example.test','27006','91000000-0000-4000-8000-000000000003','imposter-policy@example.test',items,300,1000,825);
 if named.total_cents<>12991 then raise exception 'Display name incorrectly granted a credit'; end if;
 begin
  update customers set state='SC',zip='29601' where id='92000000-0000-4000-8000-000000000003';
  raise exception 'Out-of-state address accepted';
 exception when raise_exception then if sqlerrm='Out-of-state address accepted' then raise; end if; end;
 if has_column_privilege('authenticated','customers','glass_fee_paid_at','UPDATE') or has_table_privilege('authenticated','glass_deposit_credits','SELECT') then raise exception 'Customer can alter or inspect payment credits'; end if;
 raise notice 'PASS: fixed 8.25 percent tax on meals, delivery and glass; taxed edits and cancellation;  once-only fee, pending reservation, legacy email credits, name spoofing, non-refundable cancellation, address protection and DST cutoff';
end $$;
-- Renewal invoices save Stripe's actual tax and keep delivery out of food revenue.
insert into subscriptions(id,customer_id,plan_size,stripe_subscription_id) values
 ('96000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',8,'sub_tax_test');
select record_customer_subscription_invoice('in_tax_test','sub_tax_test','pi_renewal_tax',12449,949,1000,825);
select record_customer_subscription_invoice('in_tax_test','sub_tax_test','pi_renewal_tax',12449,949,1000,825);
do $$ begin
 if (select count(*) from orders where stripe_invoice_id='in_tax_test')<>1 then raise exception 'Duplicate renewal'; end if;
 if not exists(select 1 from orders where stripe_invoice_id='in_tax_test' and total_cents=12449 and tax_cents=949 and delivery_fee_cents=1000 and subtotal_cents=10500) then raise exception 'Incorrect renewal tax snapshot'; end if;
end $$;
update holiday_settings set orders_open=true,delivery_fee_cents=1000;
do $$
declare
 s holiday_settings; o holiday_orders; repeated holiday_orders; k uuid:=gen_random_uuid();
 d jsonb:='{"full_name":"Tax Test","email":"tax@example.test","phone":"9195550100","occasion":"thanksgiving","event_date":"2026-11-25","fulfillment":"delivery","address":"1 Test St","zip":"27601","people":18,"entree":"Turkey breast","bread":"Cornbread muffins","dessert":"Apple pie","extra_dessert":false}';
begin
 select * into s from holiday_settings where id=1;
 o:=prepare_holiday_order(k,s.version,d,33558,'Consent',825);
 if o.tax_cents<>2558 or o.total_cents<>33558 or o.deposit_cents<>33558 or o.balance_cents<>0 then raise exception 'Incorrect holiday tax'; end if;
 repeated:=prepare_holiday_order(k,s.version,d,33558,'Consent',825);
 if repeated.id<>o.id then raise exception 'Holiday retry duplicated'; end if;
 begin
  perform prepare_holiday_order(gen_random_uuid(),s.version,d,31000,'Consent',825);
  raise exception 'Untaxed total accepted';
 exception when raise_exception then if sqlerrm='Untaxed total accepted' then raise; end if; end;
 raise notice 'PASS: holiday delivery tax, exact totals, forged total rejection and idempotent renewal snapshots';
end $$;
rollback;
