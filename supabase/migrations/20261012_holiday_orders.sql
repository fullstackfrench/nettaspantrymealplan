begin;

create table if not exists public.holiday_settings (
  id integer primary key default 1 check (id = 1),
  version integer not null default 1,
  per_person_cents integer not null default 1600 check (per_person_cents between 1 and 1000000),
  minimum_order_cents integer not null default 30000 check (minimum_order_cents between 0 and 10000000),
  minimum_people integer not null default 15 check (minimum_people between 1 and 1000),
  extra_dessert_cents integer default 500 check (extra_dessert_cents between 1 and 1000000),
  extra_dessert_basis text not null default 'person' check (extra_dessert_basis in ('person','order')),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 1000000),
  orders_open boolean not null default false,
  thanksgiving_deadline date not null default '2026-11-19',
  thanksgiving_fulfillment date not null default '2026-11-25',
  christmas_deadline date not null default '2026-12-18',
  christmas_fulfillment date not null default '2026-12-24',
  pickup_location text not null default '',
  delivery_zips text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (thanksgiving_deadline < thanksgiving_fulfillment),
  check (christmas_deadline < christmas_fulfillment)
);
insert into public.holiday_settings(id) values (1) on conflict do nothing;
alter table public.holiday_settings enable row level security;
drop policy if exists holiday_settings_read on public.holiday_settings;
create policy holiday_settings_read on public.holiday_settings for select to anon, authenticated using (true);
grant select on public.holiday_settings to anon, authenticated;
revoke insert, update, delete on public.holiday_settings from anon, authenticated;
grant all on public.holiday_settings to service_role;

create or replace function public.bump_holiday_settings_version() returns trigger
language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists holiday_settings_version on public.holiday_settings;
create trigger holiday_settings_version before update on public.holiday_settings
for each row execute function public.bump_holiday_settings_version();

create table if not exists public.holiday_orders (
  id uuid primary key default gen_random_uuid(),
  checkout_key uuid not null unique,
  full_name text not null,
  email text not null,
  phone text not null,
  occasion text not null check (occasion in ('thanksgiving','christmas','party')),
  event_date date not null,
  fulfillment text not null check (fulfillment in ('pickup','delivery')),
  address text not null default '',
  zip text not null default '',
  people integer not null check (people between 1 and 1000),
  entree text not null,
  bread text not null,
  dessert text not null,
  extra_dessert boolean not null default false,
  settings_version integer not null,
  pricing_snapshot jsonb not null,
  food_cents integer not null check (food_cents > 0),
  extra_cents integer not null check (extra_cents >= 0),
  delivery_cents integer not null check (delivery_cents >= 0),
  total_cents integer not null,
  deposit_cents integer not null,
  balance_cents integer not null,
  consent_text text not null,
  consent_at timestamptz not null default now(),
  deposit_status text not null default 'pending' check (deposit_status in ('pending','paid','expired')),
  fulfillment_status text not null default 'unfulfilled' check (fulfillment_status in ('unfulfilled','delivered')),
  balance_status text not null default 'unpaid' check (balance_status in ('unpaid','processing','paid','action_required')),
  stripe_customer_id text unique,
  stripe_checkout_session_id text unique,
  stripe_deposit_intent_id text unique,
  stripe_payment_method_id text,
  stripe_balance_invoice_id text unique,
  invoice_url text,
  payment_error text,
  delivered_at timestamptz,
  billing_lease_until timestamptz,
  created_at timestamptz not null default now(),
  check (total_cents = food_cents + extra_cents + delivery_cents),
  check (deposit_cents = (total_cents + 1) / 2),
  check (balance_cents = total_cents - deposit_cents),
  check (deposit_cents > 0 and balance_cents >= 0)
);
alter table public.holiday_orders enable row level security;
revoke all on public.holiday_orders from anon, authenticated;
grant all on public.holiday_orders to service_role;

-- Pricing/consent snapshots cannot change after the customer agrees to them.
create or replace function public.guard_holiday_order_snapshot() returns trigger
language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - array['deposit_status','fulfillment_status','balance_status','stripe_customer_id','stripe_checkout_session_id','stripe_deposit_intent_id','stripe_payment_method_id','stripe_balance_invoice_id','invoice_url','payment_error','delivered_at','billing_lease_until'])
     is distinct from
     (to_jsonb(old) - array['deposit_status','fulfillment_status','balance_status','stripe_customer_id','stripe_checkout_session_id','stripe_deposit_intent_id','stripe_payment_method_id','stripe_balance_invoice_id','invoice_url','payment_error','delivered_at','billing_lease_until']) then
    raise exception 'The accepted holiday order and pricing cannot be changed';
  end if;
  if old.deposit_status = 'paid' and new.deposit_status <> 'paid' then
    raise exception 'A paid holiday deposit cannot be downgraded';
  end if;
  if old.balance_status = 'paid' and new.balance_status <> 'paid' then
    raise exception 'A paid holiday balance cannot be downgraded';
  end if;
  return new;
end;
$$;
drop trigger if exists holiday_order_snapshot on public.holiday_orders;
create trigger holiday_order_snapshot before update on public.holiday_orders
for each row execute function public.guard_holiday_order_snapshot();

create or replace function public.claim_holiday_balance(p_order_id uuid)
returns setof public.holiday_orders language plpgsql security definer set search_path = public as $$
begin
  return query update public.holiday_orders set billing_lease_until = now() + interval '5 minutes'
    where id = p_order_id and deposit_status = 'paid' and fulfillment_status = 'delivered'
      and balance_status <> 'paid'
      and (billing_lease_until is null or billing_lease_until < now()) returning *;
end;
$$;
revoke all on function public.claim_holiday_balance(uuid) from public, anon, authenticated;
grant execute on function public.claim_holiday_balance(uuid) to service_role;

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
  food := greatest(n * s.per_person_cents, s.minimum_order_cents - extra - delivery);
  total := food + extra + delivery;
  if total <> p_total then raise exception 'Holiday pricing changed. Reload the page to review the current total.'; end if;
  insert into public.holiday_orders(checkout_key, full_name, email, phone, occasion, event_date, fulfillment, address, zip, people, entree, bread, dessert, extra_dessert, settings_version, pricing_snapshot, food_cents, extra_cents, delivery_cents, total_cents, deposit_cents, balance_cents, consent_text)
  values(p_key, p_details->>'full_name', p_details->>'email', p_details->>'phone', p_details->>'occasion', (p_details->>'event_date')::date, p_details->>'fulfillment', p_details->>'address', p_details->>'zip', n, p_details->>'entree', p_details->>'bread', p_details->>'dessert', (p_details->>'extra_dessert')::boolean, s.version, to_jsonb(s), food, extra, delivery, total, (total + 1) / 2, total - (total + 1) / 2, p_consent) returning * into o;
  return o;
end;
$$;
revoke all on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text) from public, anon, authenticated;
grant execute on function public.prepare_holiday_order(uuid,integer,jsonb,integer,text) to service_role;

create or replace function public.claim_holiday_checkout(p_order_id uuid)
returns setof public.holiday_orders language sql security definer set search_path = public as $$
  update public.holiday_orders set billing_lease_until = now() + interval '5 minutes'
  where id = p_order_id and deposit_status = 'pending' and stripe_checkout_session_id is null
    and (billing_lease_until is null or billing_lease_until < now()) returning *;
$$;
revoke all on function public.claim_holiday_checkout(uuid) from public, anon, authenticated;
grant execute on function public.claim_holiday_checkout(uuid) to service_role;

commit;
