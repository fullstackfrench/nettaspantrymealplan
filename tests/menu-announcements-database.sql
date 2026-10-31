\set ON_ERROR_STOP on
begin;
do $tests$
declare result jsonb; result2 jsonb; id1 uuid='20000000-0000-4000-8000-000000000001'; id2 uuid='20000000-0000-4000-8000-000000000002';
 actor uuid='10000000-0000-4000-8000-000000000001';segment uuid='50000000-0000-4000-8000-000000000001';snapshot jsonb;
begin
 if has_table_privilege('authenticated','menu_announcements','select') or has_function_privilege('authenticated','public.reserve_menu_announcement(uuid,uuid,jsonb,text,uuid,text,integer,text,text,text)','execute') then raise exception 'Customer privilege leak'; end if;
 snapshot=menu_announcement_snapshot(id1);
 begin
  perform reserve_menu_announcement('10000000-0000-4000-8000-000000000002',id1,snapshot,repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
  raise exception 'Customer was authorized';
 exception when others then if sqlerrm not like '%authorization%' then raise; end if; end;
 begin
  perform reserve_menu_announcement(actor,id1,'{}',repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
  raise exception 'Stale menu was accepted';
 exception when others then if sqlerrm not like '%menu changed%' then raise; end if; end;
 result=reserve_menu_announcement(actor,id1,snapshot,repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 if not (result->>'claimed')::boolean or not (select is_published from weekly_menus where id=id1) then raise exception 'Reservation did not publish'; end if;
 result2=reserve_menu_announcement(actor,id1,snapshot,repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 if (result2->>'claimed')::boolean then raise exception 'Duplicate was claimed'; end if;
 update menu_announcements set broadcast_id='60000000-0000-4000-8000-000000000001',status='draft' where menu_id=id1;
 perform begin_menu_announcement_send(actor,(result->>'id')::uuid,(result->>'attempt_id')::uuid);
 begin
  perform begin_menu_announcement_send(actor,(result->>'id')::uuid,(result->>'attempt_id')::uuid);
  raise exception 'Repeated send was accepted';
 exception when others then if sqlerrm not like '%already being handled%' then raise; end if; end;
 update menu_announcements set status='queued' where menu_id=id1;
 update weekly_menus set is_published=false where id=id1;
 result2=reserve_menu_announcement(actor,id1,snapshot,repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 if (result2->>'claimed')::boolean then raise exception 'Republish claimed another announcement'; end if;
 begin
  perform reserve_menu_announcement(actor,'20000000-0000-4000-8000-000000000005',menu_announcement_snapshot('20000000-0000-4000-8000-000000000005'),repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
  raise exception 'Expired menu accepted';
 exception when others then if sqlerrm not like '%closed%' then raise; end if; end;
 result2=reserve_menu_announcement(actor,id2,menu_announcement_snapshot(id2),repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 update menu_announcements set broadcast_id='60000000-0000-4000-8000-000000000002',status='draft' where menu_id=id2;
 update meals set name='Changed meal';
 begin
  perform begin_menu_announcement_send(actor,(result2->>'id')::uuid,(result2->>'attempt_id')::uuid);
  raise exception 'Changed menu sent';
 exception when others then if sqlerrm not like '%menu changed%' then raise; end if; end;
 update meals set name='Synthetic meal';
 update menu_announcements set status='failed' where menu_id=id2;
 result=reserve_menu_announcement(actor,id2,menu_announcement_snapshot(id2),repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 if not (result->>'claimed')::boolean or result->>'broadcast_id'<>'60000000-0000-4000-8000-000000000002' then raise exception 'Safe draft retry lost broadcast ID'; end if;
 update menu_announcements set status='needs_review' where menu_id=id2;
 result=reserve_menu_announcement(actor,id2,menu_announcement_snapshot(id2),repeat('a',64),segment,repeat('b',64),7,'Subject','HTML','Text');
 if (result->>'claimed')::boolean then raise exception 'Ambiguous send was retried'; end if;
 raise notice 'Passed: admin authorization, service-only access, stale/expired menu guards, publication, duplicate reservations/sends, republish protection, safe draft retry, ambiguous-send guard.';
end $tests$;
rollback;
