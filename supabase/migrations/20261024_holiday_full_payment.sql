-- Apply before deploying the full-payment holiday checkout.
begin;
-- Remove only the old half-payment constraint; other price/snapshot checks remain.
do $$
declare c record;
begin
 for c in select conname from pg_constraint where conrelid='public.holiday_orders'::regclass and contype='c'
  and pg_get_constraintdef(oid) like '%deposit_cents%total_cents%'
  and pg_get_constraintdef(oid) not like '%balance_cents%'
 loop execute format('alter table public.holiday_orders drop constraint %I',c.conname); end loop;
end $$;
alter table public.holiday_orders drop constraint if exists holiday_checkout_amount_check;
alter table public.holiday_orders add constraint holiday_checkout_amount_check check (
 (deposit_cents=total_cents and balance_cents=0) or
 (deposit_cents=(total_cents+1)/2 and balance_cents=total_cents-deposit_cents)
);
-- Existing accepted orders are never repriced; settings apply to new checkouts.
update public.holiday_settings set per_person_cents=1600,minimum_people=18,
 minimum_order_cents=30000,extra_dessert_cents=4500,extra_dessert_basis='order',orders_open=false
 where id=1;
alter table public.holiday_settings alter column minimum_people set default 18;
alter table public.holiday_settings alter column per_person_cents set default 1600;
alter table public.holiday_settings alter column minimum_order_cents set default 30000;
alter table public.holiday_settings alter column extra_dessert_cents set default 4500;
alter table public.holiday_settings alter column extra_dessert_basis set default 'order';
create or replace function public.prepare_holiday_order(p_key uuid, p_version integer, p_details jsonb, p_total integer, p_consent text)
returns public.holiday_orders language plpgsql security definer set search_path = public as $$
declare
  s public.holiday_settings;
  o public.holiday_orders;
  n integer := (p_details->>'people')::integer;
  food integer;
  extra integer;
  delivery integer;
  total integer;
begin
  -- A retry of the same browser submission never creates a second booking.
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into o from public.holiday_orders where checkout_key = p_key;
  if found then
    if o.email <> p_details->>'email' or o.full_name <> p_details->>'full_name'
      or o.people <> n or o.entree <> p_details->>'entree' or o.bread <> p_details->>'bread'
      or o.dessert <> p_details->>'dessert' or o.extra_dessert <> (p_details->>'extra_dessert')::boolean
      or o.fulfillment <> p_details->>'fulfillment' or o.occasion <> p_details->>'occasion'
      or o.event_date <> (p_details->>'event_date')::date or o.address <> p_details->>'address'
      or o.zip <> p_details->>'zip' or o.phone <> p_details->>'phone'
      or o.total_cents <> p_total or o.settings_version <> p_version then
      raise exception 'This checkout was already started with different selections. Reload the page to begin a new order.';
    end if;
    return o;
  end if;
  select * into strict s from public.holiday_settings where id = 1 for share;
  if not s.orders_open then raise exception 'Holiday ordering is not open yet.'; end if;
  if s.version <> p_version then raise exception 'Holiday pricing changed. Reload the page to review the current total.'; end if;
  if n < s.minimum_people or n > 1000 then raise exception 'Invalid group size'; end if;
  if (p_details->>'extra_dessert')::boolean and s.extra_dessert_cents is null then raise exception 'Second dessert unavailable'; end if;
  extra := case when (p_details->>'extra_dessert')::boolean then s.extra_dessert_cents * case when s.extra_dessert_basis = 'person' then n else 1 end else 0 end;
  delivery := case when p_details->>'fulfillment' = 'delivery' then s.delivery_fee_cents else 0 end;
  food := greatest(n * s.per_person_cents, s.minimum_order_cents);
  total := food + extra + delivery;
  if total <> p_total then raise exception 'Holiday pricing changed. Reload the page to review the current total.'; end if;
  insert into public.holiday_orders(checkout_key, full_name, email, phone, occasion, event_date, fulfillment, address, zip, people, entree, bread, dessert, extra_dessert, settings_version, pricing_snapshot, food_cents, extra_cents, delivery_cents, total_cents, deposit_cents, balance_cents, consent_text)
  values(p_key, p_details->>'full_name', p_details->>'email', p_details->>'phone', p_details->>'occasion', (p_details->>'event_date')::date, p_details->>'fulfillment', p_details->>'address', p_details->>'zip', n, p_details->>'entree', p_details->>'bread', p_details->>'dessert', (p_details->>'extra_dessert')::boolean, s.version, to_jsonb(s), food, extra, delivery, total, total, 0, p_consent) returning * into o;
  return o;
end;
$$;
revoke all on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text) from public, anon, authenticated;
grant execute on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text) to service_role;

-- Fulfillment must never acquire a chargeable balance, including for historical orders.
create or replace function public.claim_holiday_balance(p_order_id uuid)
returns setof public.holiday_orders language sql security definer set search_path=public as $$
 select * from public.holiday_orders where false;
$$;
revoke all on function public.claim_holiday_balance(uuid) from public,anon,authenticated;
grant execute on function public.claim_holiday_balance(uuid) to service_role;
commit;
