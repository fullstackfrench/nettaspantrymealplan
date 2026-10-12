begin;
alter table orders add column if not exists stripe_invoice_id text,
 add column if not exists needs_meal_selection boolean not null default false;
create unique index if not exists orders_stripe_invoice_uidx on orders(stripe_invoice_id) where stripe_invoice_id is not null;
create unique index if not exists subscriptions_stripe_subscription_uidx on subscriptions(stripe_subscription_id) where stripe_subscription_id is not null;

create or replace function record_customer_checkout_payment(p_order_id uuid,p_session_id text,p_payment_intent_id text,p_stripe_customer_id text,p_stripe_subscription_id text,p_stripe_price_id text,p_recurring_amount integer)
returns void language plpgsql security invoker set search_path=public as $$
declare o orders%rowtype; subscription_key uuid; units integer;
begin
 select * into o from orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 if o.customer_change_id is not null then raise exception 'Order change is in progress; retry payment confirmation.'; end if;
 if o.status='canceled' then raise exception 'Order is already canceled.'; end if;
 if o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id<>p_session_id then raise exception 'Payment session does not match this order.'; end if;
 if p_stripe_customer_id is not null then update customers set stripe_customer_id=coalesce(stripe_customer_id,p_stripe_customer_id) where id=o.customer_id; end if;
 if p_stripe_subscription_id is not null then
  select coalesce(sum(quantity),0)::integer into units from order_items where order_id=o.id;
  insert into subscriptions(customer_id,subscription_plan_id,plan_size,plan_code_snapshot,plan_name_snapshot,included_credits_snapshot,price_cents_snapshot,billing_interval_snapshot,billing_interval_count_snapshot,stripe_price_id,stripe_subscription_id)
   values(o.customer_id,o.subscription_plan_id,units,o.plan_code_snapshot,coalesce(o.plan_name_snapshot,units||' meals per week'),units,p_recurring_amount,coalesce(o.billing_interval_snapshot,'week'),coalesce(o.billing_interval_count_snapshot,1),p_stripe_price_id,p_stripe_subscription_id)
   on conflict(stripe_subscription_id) where stripe_subscription_id is not null do update set stripe_price_id=excluded.stripe_price_id
   returning id into subscription_key;
 end if;
 update orders set status=case when status='pending' then 'paid' else status end,payment_status='paid',paid_at=coalesce(paid_at,now()),stripe_checkout_session_id=p_session_id,stripe_payment_intent_id=coalesce(p_payment_intent_id,stripe_payment_intent_id),subscription_id=coalesce(subscription_key,subscription_id) where id=o.id;
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
 insert into orders(customer_id,subscription_id,order_type,status,payment_status,fulfillment_status,paid_at,week_start,subtotal_cents,total_cents,containers_issued,stripe_invoice_id,stripe_payment_intent_id,needs_meal_selection,delivery_address_line1,delivery_address_line2,delivery_city,delivery_zip,delivery_notes,included_credits_snapshot)
 values(s.customer_id,s.id,'subscription','paid','paid','unfulfilled',now(),w.week_start,p_amount,p_amount,coalesce(s.included_credits_snapshot,s.plan_size),p_invoice_id,p_payment_intent_id,choices is null,c.address_line1,c.address_line2,c.city,c.zip,c.delivery_notes,coalesce(s.included_credits_snapshot,s.plan_size)) returning id into created_order;
 if choices is not null then
  insert into order_items(order_id,meal_id,meal_size_id,meal_name_snapshot,size_label_snapshot,servings_snapshot,quantity,unit_price_cents)
   select created_order,m.id,z.id,m.name,z.label,z.servings,i.quantity,0 from jsonb_to_recordset(choices) as i(meal_id uuid,meal_size_id uuid,quantity integer) join meals m on m.id=i.meal_id join meal_sizes z on z.id=i.meal_size_id and z.meal_id=m.id;
 end if;
end $$;
revoke all on function record_customer_checkout_payment(uuid,text,text,text,text,text,integer) from public,anon,authenticated;
revoke all on function record_customer_subscription_invoice(text,text,text,integer) from public,anon,authenticated;
grant execute on function record_customer_checkout_payment(uuid,text,text,text,text,text,integer) to service_role;
grant execute on function record_customer_subscription_invoice(text,text,text,integer) to service_role;
commit;
