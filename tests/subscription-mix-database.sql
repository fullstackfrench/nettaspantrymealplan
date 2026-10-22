-- Isolated database only, after schema.sql and customer-account-rollout.sql.
begin;
do $$
declare
 side_id uuid:=gen_random_uuid(); entree_id uuid:=gen_random_uuid(); dessert_id uuid:=gen_random_uuid();
 side_size uuid:=gen_random_uuid(); entree_size uuid:=gen_random_uuid();
 menu uuid:=gen_random_uuid(); user_id uuid:=gen_random_uuid(); customer uuid;
 plan subscription_plans%rowtype; prepared record; choices jsonb; unbalanced jsonb;
 sub_id uuid; change customer_order_changes%rowtype; invoice text;
begin
 insert into auth.users(id) values(user_id);
 insert into customers(auth_user_id,email,full_name,address_line1,city,zip) values(user_id,'mix-test@example.test','Test','1 Test St','Raleigh','27601') returning id into customer;
 insert into meals(id,slug,name,price_cents,tags) values
  (side_id,'mix-side','Carrots',800,array['sides']),
  (entree_id,'mix-entree','Soup',1500,array['soups']),
  (dessert_id,'mix-dessert','Pudding',800,array['desserts']);
 insert into meal_sizes(id,meal_id,label,servings,price_cents,is_available_for_subscription) values
  (side_size,side_id,'Regular',2,800,true),(entree_size,entree_id,'Regular',1,1500,true);
 insert into weekly_menus(id,week_start,is_published) values(menu,'2099-01-05',true);
 insert into weekly_menu_items(menu_id,meal_id) values(menu,side_id),(menu,entree_id);
 for plan in select * from subscription_plans where code in ('weekly-6','weekly-8','weekly-12') loop
  choices:=jsonb_build_array(jsonb_build_object('meal_id',side_id,'meal_size_id',side_size,'quantity',plan.included_credits/2),jsonb_build_object('meal_id',entree_id,'meal_size_id',entree_size,'quantity',plan.included_credits/2));
  unbalanced:=jsonb_build_array(jsonb_build_object('meal_id',side_id,'meal_size_id',side_size,'quantity',1),jsonb_build_object('meal_id',entree_id,'meal_size_id',entree_size,'quantity',plan.included_credits-1));
  if not subscription_mix_valid(choices,plan.included_credits) or subscription_mix_valid(unbalanced,plan.included_credits) then raise exception 'Mix count guard failed'; end if;
  if subscription_mix_valid(choices||jsonb_build_array(jsonb_build_object('meal_id',dessert_id,'quantity',1)),plan.included_credits) then raise exception 'Dessert accepted'; end if;
  begin
   perform prepare_checkout_order(gen_random_uuid(),repeat('x',64),'subscription',plan.id,'Test','mix-test@example.test','27601',user_id,'mix-test@example.test',unbalanced,300,0);
   raise exception 'Unbalanced checkout accepted';
  exception when raise_exception then if sqlerrm not like 'Your subscription must contain exactly%' then raise; end if; end;
  select * into prepared from prepare_checkout_order(gen_random_uuid(),repeat('x',64),'subscription',plan.id,'Test','mix-test@example.test','27601',user_id,'mix-test@example.test',choices,300,0);
  if prepared.subtotal_cents<>plan.price_cents then raise exception 'Wrong checkout price'; end if;
  if plan.code='weekly-8' and prepared.subtotal_cents<>10500 then raise exception 'Wrong eight-meal price'; end if;
  if plan.code='weekly-12' and prepared.subtotal_cents<>16500 then raise exception 'Wrong twelve-meal price'; end if;
  begin
   perform begin_customer_order_change(user_id,prepared.order_id,gen_random_uuid(),'edit',unbalanced,'{"address_line1":"1 Test St","city":"Raleigh","zip":"27601"}');
   raise exception 'Unbalanced edit accepted';
  exception when raise_exception then if sqlerrm not like 'Your subscription must contain exactly%' then raise; end if; end;
  change:=begin_customer_order_change(user_id,prepared.order_id,gen_random_uuid(),'edit',choices,'{"address_line1":"1 Test St","city":"Raleigh","zip":"27601"}');
  perform finish_customer_order_change(change.id);
  insert into subscriptions(customer_id,subscription_plan_id,plan_size,included_credits_snapshot,stripe_subscription_id)
   values(customer,plan.id,plan.included_credits,plan.included_credits,'sub_mix_'||plan.code) returning id into sub_id;
  begin
   perform save_customer_week_choices(user_id,sub_id,menu,unbalanced);
   raise exception 'Unbalanced weekly choices accepted';
  exception when raise_exception then if sqlerrm not like 'Your subscription must contain exactly%' then raise; end if; end;
  perform save_customer_week_choices(user_id,sub_id,menu,choices);
  invoice:='in_mix_'||plan.code;
  perform record_customer_subscription_invoice(invoice,'sub_mix_'||plan.code,'pi_'||invoice,plan.price_cents);
  perform record_customer_subscription_invoice(invoice,'sub_mix_'||plan.code,'pi_'||invoice,plan.price_cents);
  if (select count(*) from orders where stripe_invoice_id=invoice)<>1 or (select needs_meal_selection from orders where stripe_invoice_id=invoice) then raise exception 'Valid renewal or idempotency failed'; end if;
  -- Simulate an old saved selection or a category change after choices were saved.
  update subscription_week_choices set items=unbalanced where subscription_id=sub_id and menu_id=menu;
  perform record_customer_subscription_invoice(invoice||'_bad','sub_mix_'||plan.code,'pi_'||invoice||'_bad',plan.price_cents);
  if not (select needs_meal_selection from orders where stripe_invoice_id=invoice||'_bad') then raise exception 'Invalid renewal was sent to kitchen'; end if;
 end loop;
 -- One-time purchases remain free of subscription mix restrictions.
 select * into prepared from prepare_checkout_order(gen_random_uuid(),repeat('x',64),'one_time',null,'Test','mix-test@example.test','27601',user_id,'mix-test@example.test',jsonb_build_array(jsonb_build_object('meal_id',side_id,'meal_size_id',side_size,'quantity',1)),300,0);
 if prepared.subtotal_cents<>800 then raise exception 'One-time purchase changed'; end if;
 if has_function_privilege('anon','assert_subscription_mix(jsonb,integer)','execute') or has_function_privilege('authenticated','prepare_checkout_order(uuid,text,text,uuid,text,text,text,uuid,text,jsonb,integer,integer)','execute') then raise exception 'RPC privilege regression'; end if;
 raise notice 'PASS: all tiers, authoritative prices, checkout, edits, saved choices, renewal validation, idempotency, one-time orders and privileges';
end $$;
rollback;
