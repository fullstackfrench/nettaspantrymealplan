-- Supabase installs uuid-ossp in extensions, outside the RPC's public-only search_path.
-- Use PostgreSQL's built-in UUID generator for retries and new ledger defaults.
begin;
alter table public.menu_announcements alter column id set default pg_catalog.gen_random_uuid();
alter table public.menu_announcements alter column attempt_id set default pg_catalog.gen_random_uuid();

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
   actor_id=p_actor_id,attempt_id=pg_catalog.gen_random_uuid(),attempts=attempts+1,last_error=null,
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

commit;
