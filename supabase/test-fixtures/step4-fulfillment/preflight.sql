begin read only;
select jsonb_build_object(
 'triggers',(select jsonb_agg(jsonb_build_object(
  'table',c.relname,'trigger',t.tgname,'function',p.proname,'function_md5',md5(p.prosrc),
  'possible_outbound_call',p.prosrc ~* '(https?://|http_request|net[.]http|http_post|http_get|dblink|pg_notify|send_mail|send_email|resend|sendgrid|postmark|smtp)'
 ) order by c.relname,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
 where n.nspname='public' and not t.tgisinternal and c.relname in ('customers','orders','order_items','admin_order_notes','order_fulfillment_history','order_notification_outbox','container_events')),
 'scheduler',jsonb_build_object('cron_jobs_table',to_regclass('cron.job'),'pg_net_installed',exists(select 1 from pg_extension where extname='pg_net')),
 'outbox_state',(select jsonb_build_object('processing',count(*) filter(where status='processing'),'sent',count(*) filter(where status='sent'),'pending',count(*) filter(where status='pending'),'failed',count(*) filter(where status='failed')) from order_notification_outbox),
 'test_identity_conflicts',(select count(*) from customers where email like 'step4-fulfillment-%@example.invalid')
) as preflight;
commit;
