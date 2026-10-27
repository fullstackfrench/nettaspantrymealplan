-- Remove only the approved synthetic fixture. Do not execute until manual verification is finished.
begin;
set local statement_timeout='15s';
set local lock_timeout='5s';
select pg_advisory_xact_lock(hashtext('netta-step4-fixture-9e716037-4456-44dd-9f68-1cb6469eab95'));
do $$ begin
 if not exists(select 1 from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' and email='step4-fulfillment-9e716037@example.invalid' and full_name='TEST ONLY — Step 4 Fulfillment 9e716037' and auth_user_id is null and stripe_customer_id is null)
 or not exists(select 1 from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95' and customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' and contact_email='step4-fulfillment-9e716037@example.invalid' and subscription_id is null and stripe_checkout_session_id is null and stripe_payment_intent_id is null and stripe_invoice_id is null)
 then raise exception 'Fixture identity does not match. Stop; nothing has been deleted.'; end if;
 perform 1 from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' for update;
 perform 1 from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95' for update;
 if exists(select 1 from orders where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' and id<>'9e716037-4456-44dd-9f68-1cb6469eab95')
 or exists(select 1 from subscriptions where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266')
 or exists(select 1 from customer_order_changes where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' or order_id='9e716037-4456-44dd-9f68-1cb6469eab95')
 or exists(select 1 from stripe_webhook_events where order_id='9e716037-4456-44dd-9f68-1cb6469eab95')
 or exists(select 1 from container_events where order_id='9e716037-4456-44dd-9f68-1cb6469eab95' and customer_id<>'7825c77e-1bcd-44bd-8b0e-a05d8c25d266')
 or exists(select 1 from container_events where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' and order_id is not null and order_id<>'9e716037-4456-44dd-9f68-1cb6469eab95')
 or exists(select 1 from order_notification_outbox n join order_fulfillment_history h on h.id=n.event_id where h.order_id='9e716037-4456-44dd-9f68-1cb6469eab95' and (n.status in ('processing','sent') or n.attempts>0 or n.sent_at is not null))
 then raise exception 'Unexpected linked activity. Preserve the fixture for review; cleanup aborted.'; end if;
 delete from order_notification_outbox n using order_fulfillment_history h where h.id=n.event_id and h.order_id='9e716037-4456-44dd-9f68-1cb6469eab95';
 delete from admin_order_notes where order_id='9e716037-4456-44dd-9f68-1cb6469eab95';
 delete from order_fulfillment_history where order_id='9e716037-4456-44dd-9f68-1cb6469eab95';
 delete from order_items where order_id='9e716037-4456-44dd-9f68-1cb6469eab95';
 -- The dedicated customer is deleted in this same transaction. No surviving balances need adjustment.
 delete from container_events where customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266';
 delete from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95' and customer_id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266';
 delete from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266' and email='step4-fulfillment-9e716037@example.invalid';
 if exists(select 1 from customers where id='7825c77e-1bcd-44bd-8b0e-a05d8c25d266') or exists(select 1 from orders where id='9e716037-4456-44dd-9f68-1cb6469eab95') then raise exception 'Cleanup verification failed.'; end if;
end $$;
select 'Synthetic fixture removed; menu records and other customers unchanged' as result;
commit;
