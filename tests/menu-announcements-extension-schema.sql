-- Match production Supabase: uuid-ossp lives outside the RPC search_path.
create schema if not exists extensions;
alter extension "uuid-ossp" set schema extensions;
set search_path=public;
