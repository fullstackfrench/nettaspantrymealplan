\set ON_ERROR_STOP on
begin;
update public.holiday_settings set orders_open=true,pickup_location='Test pickup';
insert into auth.users(id) values('a1000000-0000-4000-8000-000000000001');
update profiles set role='admin' where id='a1000000-0000-4000-8000-000000000001';
do $$
declare
 s public.holiday_settings; o public.holiday_orders; repeated public.holiday_orders;
 details jsonb:='{"full_name":"Test","email":"test@example.test","phone":"9195550100","occasion":"thanksgiving","event_date":"2026-11-25","fulfillment":"pickup","address":"","zip":"","people":18,"entree":"Turkey breast","bread":"Cornbread muffins","dessert":"Apple pie","extra_dessert":true}';
 key uuid:=gen_random_uuid(); claims integer;
begin
 select * into s from public.holiday_settings where id=1;
 if s.per_person_cents<>1667 or s.minimum_people<>18 or s.extra_dessert_cents<>4500 or s.extra_dessert_basis<>'order' then raise exception 'Incorrect current prices'; end if;
 o:=public.prepare_holiday_order(key,s.version,details,34500,'Full payment consent');
 if o.total_cents<>34500 or o.deposit_cents<>34500 or o.balance_cents<>0 then raise exception 'Incorrect full-payment amounts'; end if;
 repeated:=public.prepare_holiday_order(key,s.version,details,34500,'Full payment consent');
 if repeated.id<>o.id then raise exception 'Duplicate order'; end if;
 repeated:=public.prepare_holiday_order(gen_random_uuid(),s.version,details||'{"extra_dessert":false}',30000,'Full payment consent');
 if repeated.total_cents<>30000 or repeated.deposit_cents<>30000 or repeated.balance_cents<>0 then raise exception 'Incorrect package pricing'; end if;
 begin
  perform public.prepare_holiday_order(gen_random_uuid(),s.version,details||'{"people":17}',34500,'Consent');
  raise exception 'Under-minimum group accepted';
 exception when raise_exception then if sqlerrm='Under-minimum group accepted' then raise; end if; end;
 begin
  perform public.prepare_holiday_order(gen_random_uuid(),s.version,details,45000,'Consent');
  raise exception 'Forged total accepted';
 exception when raise_exception then if sqlerrm='Forged total accepted' then raise; end if; end;
 begin
  perform public.prepare_holiday_order(key,s.version,details||'{"people":19}',34500,'Consent');
  raise exception 'Changed submission accepted';
 exception when raise_exception then if sqlerrm='Changed submission accepted' then raise; end if; end;
 update public.holiday_settings set per_person_cents=1700;
 select * into repeated from public.holiday_orders where id=o.id;
 if repeated.total_cents<>34500 then raise exception 'Accepted order repriced'; end if;
 begin
  perform public.prepare_holiday_order(gen_random_uuid(),s.version,details,34500,'Consent');
  raise exception 'Stale price accepted';
 exception when raise_exception then if sqlerrm='Stale price accepted' then raise; end if; end;
 begin
  update public.holiday_orders set total_cents=95000 where id=o.id;
  raise exception 'Accepted order was mutable';
 exception when raise_exception then if sqlerrm='Accepted order was mutable' then raise; end if; end;
 update public.holiday_orders set deposit_status='paid',balance_status='paid' where id=o.id;
 perform public.transition_order_fulfillment(o.id,'packed','a1000000-0000-4000-8000-000000000001','holiday');
 perform public.transition_order_fulfillment(o.id,'delivered','a1000000-0000-4000-8000-000000000001','holiday');
 select count(*) into claims from public.claim_holiday_balance(o.id);
 if claims<>0 then raise exception 'Fulfillment allowed another charge'; end if;
 if has_table_privilege('anon','public.holiday_orders','select') or has_table_privilege('authenticated','public.holiday_settings','update') then raise exception 'Privacy regression'; end if;
 if has_function_privilege('authenticated','public.prepare_holiday_order(uuid,integer,jsonb,integer,text,integer)','execute') then raise exception 'Public billing RPC'; end if;
 raise notice 'PASS: $300 package, $45 dessert, 18-person minimum, full payment, immutable snapshots, idempotency, no fulfillment charge and permissions';
end $$;
rollback;
