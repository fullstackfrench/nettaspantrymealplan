-- Persistent, service-only menu announcement reservations. No triggers send email.
begin;
create table if not exists public.menu_announcements (
 id uuid primary key default uuid_generate_v4(),
 menu_id uuid not null unique references public.weekly_menus(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 status text not null check(status in ('preparing','draft','sending','queued','failed','needs_review')),
 stage text not null default 'create' check(stage in ('create','send')),
 attempt_id uuid not null default uuid_generate_v4(),
 attempts integer not null default 1,
 snapshot jsonb not null,
 revision text not null,
 segment_id uuid not null,
 audience_hash text not null,
 recipient_count integer not null check(recipient_count>0),
 subject text not null,
 html text not null,
 text_body text not null,
 broadcast_id uuid unique,
 provider_status text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 queued_at timestamptz
);
alter table public.menu_announcements enable row level security;
revoke all on public.menu_announcements from public,anon,authenticated;
grant all on public.menu_announcements to service_role;

create or replace function public.menu_announcement_snapshot(p_menu_id uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('week_start',w.week_start,'items',coalesce((
  select jsonb_agg(jsonb_build_object('id',i.id,'sold_out',i.sold_out,'meal',
   to_jsonb(m)||jsonb_build_object('meal_sizes',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from meal_sizes s where s.meal_id=m.id),'[]'::jsonb)))
   order by i.id)
  from weekly_menu_items i join meals m on m.id=i.meal_id where i.menu_id=w.id
 ),'[]'::jsonb)) from weekly_menus w where w.id=p_menu_id;
$$;

create or replace function public.menu_announcement_context(p_menu_id uuid) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('snapshot',public.menu_announcement_snapshot(w.id),'published',w.is_published,
  'closes_at',public.weekly_menu_closes_at(w.week_start),
  'latest_published_week',(select max(week_start) from weekly_menus where is_published),
  'announcement',(select to_jsonb(a)-array['snapshot','html','text_body'] from menu_announcements a where a.menu_id=w.id))
 from weekly_menus w where w.id=p_menu_id;
$$;

create or replace function public.reserve_menu_announcement(
 p_actor_id uuid,p_menu_id uuid,p_snapshot jsonb,p_revision text,p_segment_id uuid,
 p_audience_hash text,p_recipient_count integer,p_subject text,p_html text,p_text text
) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare w weekly_menus%rowtype; a menu_announcements%rowtype;
begin
 if not exists(select 1 from profiles where id=p_actor_id and role='admin') then raise exception 'Administrator authorization required.'; end if;
 -- Serialize publishing decisions, including the ordinary Publish action.
 lock table weekly_menus in share row exclusive mode;
 select * into w from weekly_menus where id=p_menu_id for update;
 if not found then raise exception 'Menu not found.'; end if;
 select * into a from menu_announcements where menu_id=p_menu_id for update;
 if found and a.status not in ('failed') then
  return jsonb_build_object('claimed',false,'id',a.id,'status',a.status,'broadcast_id',a.broadcast_id);
 end if;
 if now()>=public.weekly_menu_closes_at(w.week_start) then raise exception 'Ordering for this menu has closed. No announcement was sent.'; end if;
 if exists(select 1 from weekly_menus where is_published and week_start>w.week_start) then raise exception 'A newer menu is already published. Choose the current menu.'; end if;
 if public.menu_announcement_snapshot(p_menu_id) is distinct from p_snapshot then raise exception 'The menu changed. Review the email again.'; end if;
 if coalesce(p_recipient_count,0)<=0 or length(coalesce(p_revision,''))<>64 or length(coalesce(p_audience_hash,''))<>64 then raise exception 'Invalid announcement confirmation.'; end if;
 if nullif(p_subject,'') is null or nullif(p_html,'') is null or nullif(p_text,'') is null then raise exception 'The announcement content is missing.'; end if;
 if a.id is not null then
  -- Only a definite rejected creation, or a recovered unsent draft, can retry.
  if a.stage<>'create' then raise exception 'Review the previous send in Resend before retrying.'; end if;
  if a.broadcast_id is not null and (a.revision<>p_revision or a.audience_hash<>p_audience_hash) then raise exception 'The saved draft differs from this confirmation. Review it in Resend.'; end if;
  update menu_announcements set status=case when broadcast_id is null then 'preparing' else 'draft' end,
   actor_id=p_actor_id,attempt_id=uuid_generate_v4(),attempts=attempts+1,last_error=null,
   snapshot=p_snapshot,revision=p_revision,segment_id=p_segment_id,audience_hash=p_audience_hash,
   recipient_count=p_recipient_count,subject=p_subject,html=p_html,text_body=p_text,updated_at=now()
   where id=a.id returning * into a;
 else
  insert into menu_announcements(menu_id,actor_id,status,snapshot,revision,segment_id,audience_hash,recipient_count,subject,html,text_body)
  values(p_menu_id,p_actor_id,'preparing',p_snapshot,p_revision,p_segment_id,p_audience_hash,p_recipient_count,p_subject,p_html,p_text) returning * into a;
 end if;
 update weekly_menus set is_published=true where id=p_menu_id;
 return jsonb_build_object('claimed',true,'id',a.id,'attempt_id',a.attempt_id,'status',a.status,'broadcast_id',a.broadcast_id);
end $$;

create or replace function public.begin_menu_announcement_send(p_actor_id uuid,p_announcement_id uuid,p_attempt_id uuid) returns boolean
language plpgsql security invoker set search_path=public as $$
declare a menu_announcements%rowtype; w weekly_menus%rowtype;
begin
 if not exists(select 1 from profiles where id=p_actor_id and role='admin') then raise exception 'Administrator authorization required.'; end if;
 lock table weekly_menus in share row exclusive mode;
 select * into a from menu_announcements where id=p_announcement_id for update;
 if not found or a.attempt_id<>p_attempt_id or a.status<>'draft' or a.broadcast_id is null then raise exception 'This announcement is already being handled.'; end if;
 select * into w from weekly_menus where id=a.menu_id;
 if not w.is_published or now()>=public.weekly_menu_closes_at(w.week_start)
  or exists(select 1 from weekly_menus where is_published and week_start>w.week_start)
  or public.menu_announcement_snapshot(w.id) is distinct from a.snapshot then
  raise exception 'The menu changed or ordering closed. No announcement was sent. Review the saved draft in Resend.';
 end if;
 update menu_announcements set status='sending',stage='send',updated_at=now() where id=a.id;
 return true;
end $$;

revoke all on function public.menu_announcement_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.menu_announcement_context(uuid) from public,anon,authenticated;
revoke all on function public.reserve_menu_announcement(uuid,uuid,jsonb,text,uuid,text,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.begin_menu_announcement_send(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.menu_announcement_snapshot(uuid),public.menu_announcement_context(uuid),public.reserve_menu_announcement(uuid,uuid,jsonb,text,uuid,text,integer,text,text,text),public.begin_menu_announcement_send(uuid,uuid,uuid) to service_role;
commit;
