-- Synthetic local database only. This never reads .env.local.
do $$ begin if current_database() not like 'netta_announcement_test%' then raise exception 'Use a netta_announcement_test database.'; end if; end $$;
create extension if not exists "uuid-ossp";
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table profiles(id uuid primary key,role text not null);
create table weekly_menus(id uuid primary key default uuid_generate_v4(),week_start date not null unique,is_published boolean not null default false);
create table meals(id uuid primary key default uuid_generate_v4(),name text not null,is_active boolean default true);
create table meal_sizes(id uuid primary key default uuid_generate_v4(),meal_id uuid references meals(id),label text,servings integer,price_cents integer);
create table weekly_menu_items(id uuid primary key default uuid_generate_v4(),menu_id uuid references weekly_menus(id),meal_id uuid references meals(id),sold_out boolean default false);
create or replace function public.weekly_menu_closes_at(p_week_start date) returns timestamptz language sql immutable as $$ select (date_trunc('week',p_week_start::timestamp)+interval '20 hours') at time zone 'America/New_York'; $$;
grant usage on schema public to anon,authenticated,service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
insert into profiles values ('10000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000002','customer');
insert into weekly_menus(id,week_start) values
 ('20000000-0000-4000-8000-000000000001','2099-01-05'),
 ('20000000-0000-4000-8000-000000000002','2099-01-12'),
 ('20000000-0000-4000-8000-000000000003','2099-01-19'),
 ('20000000-0000-4000-8000-000000000004','2099-01-26'),
 ('20000000-0000-4000-8000-000000000005','2000-01-03'),
 ('20000000-0000-4000-8000-000000000006','2099-02-02');
insert into meals values ('30000000-0000-4000-8000-000000000001','Synthetic meal',true);
insert into meal_sizes values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Half',2,2100);
insert into weekly_menu_items(menu_id,meal_id) select id,'30000000-0000-4000-8000-000000000001' from weekly_menus;
