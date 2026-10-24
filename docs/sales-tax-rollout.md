# Fixed Stripe sales tax

Apply `supabase/migrations/20261024_sales_tax.sql` after the meal-ordering-policy migration, before deploying the tax changes. It adds tax snapshots and updates checkout, renewal, and order-change functions. Existing orders retain their original tax rate of zero; existing application calls remain compatible during deployment.

New checkouts request a fixed 8.25% exclusive manual Stripe Tax Rate. The server finds or creates it in the Stripe account associated with `STRIPE_SECRET_KEY`; rate IDs are never shared between test and live mode. This does not enable automatic Stripe Tax. Stripe collects tax on meals, delivery, and the non-refundable glass fee. The food minimum continues to exclude fees and tax.

The website previews cents rounded per checkout line. Stripe's manual invoice rounding setting can instead round once per invoice; the server accepts either valid result and saves Stripe's exact tax and total before returning the checkout URL. Holiday orders use one taxable package line. Recurring food and delivery lines, and subscription defaults, carry the rate into renewals. The glass charge remains one-time.

Order edits keep the saved tax rate, recalculate tax, and include it in refunds or additional payments. Address-only edits retain the original exact tax snapshot. Adjustment payments use the equivalent inclusive manual rate because their reserved difference already includes tax. Cancellation retains the non-refundable glass fee and its associated tax.

Checks: `node --test tests/*.cjs`, `npm run build`, and local SQL suites `tests/fixed-sales-tax.sql`, `tests/meal-ordering-policy.sql`, and `tests/holiday-orders.sql`. SQL tests run inside transactions and roll back. Stripe tax-rate provisioning was exercised in test mode without creating orders or payments.
