-- Additive, admin-only notes. Apply only after approval; no fulfillment changes.
begin;
create table if not exists public.admin_order_notes (
  order_id uuid primary key references public.orders(id) on delete cascade,
  note text not null default '' check (length(note) <= 5000),
  updated_at timestamptz not null default now()
);
alter table public.admin_order_notes enable row level security;
revoke all on public.admin_order_notes from public, anon, authenticated;
grant all on public.admin_order_notes to service_role;

create or replace function public.stamp_admin_order_note() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists admin_order_note_updated on public.admin_order_notes;
create trigger admin_order_note_updated before update on public.admin_order_notes
for each row execute function public.stamp_admin_order_note();
commit;
