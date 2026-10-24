-- Future holiday orders use the same $10 delivery fee as weekly meal orders.
-- Existing paid orders retain their pricing snapshots.
update public.holiday_settings set delivery_fee_cents = 1000 where id = 1;
alter table public.holiday_settings alter column delivery_fee_cents set default 1000;
