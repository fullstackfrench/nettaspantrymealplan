-- Minimal Supabase-compatible objects for an isolated PostgreSQL test database only.
do $$ begin if current_database() not like 'netta_fulfillment%' then raise exception 'Use an isolated netta_fulfillment database.'; end if; end $$;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table storage.buckets(id text primary key,name text,public boolean);
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on auth.users to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage,select on sequences to service_role;
