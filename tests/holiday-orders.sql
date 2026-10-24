\set ON_ERROR_STOP on
begin;
update public.holiday_settings set orders_open = true, pickup_location = 'Test pickup';

do $$
declare
  s public.holiday_settings;
  o public.holiday_orders;
  repeated public.holiday_orders;
  details jsonb := '{"full_name":"Test","email":"test@example.com","phone":"9195550100","occasion":"thanksgiving","event_date":"2026-11-25","fulfillment":"pickup","address":"","zip":"","people":25,"entree":"Turkey breast","bread":"Cornbread muffins","dessert":"Apple pie","extra_dessert":true}';
  key uuid := gen_random_uuid();
  claims integer;
begin
  select * into s from public.holiday_settings where id = 1;
  select * into o from public.prepare_holiday_order(key, s.version, details, 52500, 'Accepted payment consent');
  if o.total_cents <> 52500 or o.deposit_cents <> 26250 or o.balance_cents <> 26250 then raise exception 'Invalid deposit pricing'; end if;
  select * into repeated from public.prepare_holiday_order(key, s.version, details, 52500, 'Accepted payment consent');
  if repeated.id <> o.id then raise exception 'Duplicate order'; end if;
  select * into repeated from public.prepare_holiday_order(gen_random_uuid(), s.version, details || '{"people":15}', 31500, 'Consent');
  if repeated.total_cents <> 31500 or repeated.deposit_cents <> 15750 then raise exception 'Order minimum was incorrectly applied before extras'; end if;
  begin
    perform public.prepare_holiday_order(key, s.version, details || '{"people":26}', 52500, 'Consent');
    raise exception 'Different selections reused a checkout key';
  exception when raise_exception then
    if sqlerrm = 'Different selections reused a checkout key' then raise; end if;
  end;
  update public.holiday_settings set per_person_cents = 2000;
  select * into repeated from public.holiday_orders where id = o.id;
  if repeated.total_cents <> 52500 then raise exception 'Existing order repriced'; end if;
  begin
    update public.holiday_orders set total_cents = 60000 where id = o.id;
    raise exception 'Accepted total was mutable';
  exception when raise_exception then
    if sqlerrm = 'Accepted total was mutable' then raise; end if;
  end;
  begin
    perform public.prepare_holiday_order(gen_random_uuid(), s.version, details, 52500, 'Consent');
    raise exception 'Stale pricing accepted';
  exception when raise_exception then
    if sqlerrm = 'Stale pricing accepted' then raise; end if;
  end;
  select count(*) into claims from public.claim_holiday_balance(o.id);
  if claims <> 0 then raise exception 'Unpaid/unfulfilled order charged'; end if;
  update public.holiday_orders set deposit_status = 'paid', fulfillment_status = 'delivered' where id = o.id;
  select count(*) into claims from public.claim_holiday_balance(o.id);
  if claims <> 1 then raise exception 'Valid balance not claimed'; end if;
  select count(*) into claims from public.claim_holiday_balance(o.id);
  if claims <> 0 then raise exception 'Concurrent balance claim allowed'; end if;
  update public.holiday_orders set balance_status = 'paid', billing_lease_until = null where id = o.id;
  select count(*) into claims from public.claim_holiday_balance(o.id);
  if claims <> 0 then raise exception 'Paid balance claimed again'; end if;
  begin
    update public.holiday_orders set balance_status = 'unpaid' where id = o.id;
    raise exception 'Paid balance downgraded';
  exception when raise_exception then
    if sqlerrm = 'Paid balance downgraded' then raise; end if;
  end;
  if has_table_privilege('anon', 'public.holiday_orders', 'select') or has_table_privilege('authenticated', 'public.holiday_orders', 'select') then raise exception 'Holiday order privacy violated'; end if;
  if has_table_privilege('authenticated', 'public.holiday_settings', 'update') then raise exception 'Customer can change prices'; end if;
  if has_function_privilege('anon','public.claim_holiday_balance(uuid)','execute') or has_function_privilege('authenticated','public.prepare_holiday_order(uuid,integer,jsonb,integer,text)','execute') then raise exception 'Public billing RPC allowed'; end if;
  raise notice 'Holiday DB checks passed: authoritative pricing, snapshots, retries, billing locks, permissions';
end;
$$;
rollback;
