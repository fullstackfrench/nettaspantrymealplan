#!/bin/zsh
# Run from the repository root. Never reads .env.local or a production URL.
set -eu
test_db="${FULFILLMENT_TEST_DATABASE:-netta_fulfillment_v$(date +%Y%m%d%H%M%S)}"
if [[ ! "$test_db" =~ '^netta_fulfillment_v[0-9]+$' ]]; then
  print -u2 'Use a fresh database named netta_fulfillment_v followed by digits.'
  exit 1
fi
createdb -h /private/tmp -p 55443 "$test_db"
for file in tests/fulfillment-bootstrap.sql supabase/schema.sql \
  supabase/migrations/20260821_pricing_and_meal_size_foundation.sql \
  supabase/migrations/20260821_stripe_payment_foundation.sql \
  supabase/migrations/20260821_atomic_checkout_preparation.sql \
  supabase/migrations/20261011_customer_accounts.sql \
  supabase/migrations/20261011_customer_billing.sql \
  supabase/migrations/20261012_holiday_orders.sql \
  supabase/migrations/20261022_subscription_mix_and_prices.sql \
  supabase/migrations/20261024_holiday_full_payment.sql \
  supabase/migrations/20261024_delivery_fee.sql \
  supabase/migrations/20261024_meal_ordering_policy.sql \
  supabase/migrations/20261024_sales_tax.sql \
  supabase/migrations/20261026_admin_order_notes.sql \
  tests/fulfillment-legacy-fixtures.sql \
  supabase/migrations/20261027_order_fulfillment.sql \
  tests/fulfillment-database.sql \
  tests/fixed-sales-tax.sql tests/subscription-mix-database.sql tests/holiday-orders.sql; do
  print "Checking $file"
  psql -h /private/tmp -p 55443 -d "$test_db" -v ON_ERROR_STOP=1 -f "$file"
done
RUN_FULFILLMENT_DATABASE_TESTS=true FULFILLMENT_TEST_DATABASE="$test_db" node --test tests/fulfillment-concurrency.cjs
print "Test database retained for review: $test_db"
