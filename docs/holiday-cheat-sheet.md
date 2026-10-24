# Hassle-Free Holidays

The holiday page and homepage banner use the supplied Hassle-Free Holidays image and title. The existing `/holiday-cheat-sheet` URL is retained. The holiday page, homepage banner, and navigation are merged into main. Holiday orders have their own settings and payment records, separate from weekly meals and subscriptions.

## Current pricing and payment terms

- $16 per person, an 18-person minimum, and a $300 minimum holiday package before dessert extras and delivery.
- One entrée, both sides, one bread/dressing, and one dessert.
- Optional second dessert: a flat $45 per order. Selecting it adds the other dessert automatically.
- Customers pay the entire order total at checkout, including extras and any delivery fee.
- No card-saving authorization, later balance invoice, or automatic charge at fulfillment.
- Eighteen people total $288 at $16 each; the $300 minimum raises a package with one dessert to $300. Adding the second dessert makes that order $345 before delivery.
- Accepted orders keep their pricing snapshots. Settings changes affect new checkouts.

## Full-payment rollout

Apply `supabase/migrations/20261024_holiday_full_payment.sql` in the Supabase SQL Editor before deploying this application change. It updates prices, removes the mandatory half-payment constraint, prepares every new order for full payment, and disables the old balance-claim RPC. It preserves order snapshots and keeps ordering closed during the rollout. The production preflight found zero existing holiday orders.

The existing database column names `deposit_cents` and `deposit_status` are retained for compatibility. New orders store the entire checkout amount in `deposit_cents` and zero in `balance_cents`; verified full payment marks both statuses paid. No deposit terminology is shown to customers for new orders. Checkout rejects historical half-payment preparations rather than opening a partial-payment session.

The original installation migration is `supabase/migrations/20261012_holiday_orders.sql`. New installations must apply it first, then the full-payment migration.

## Stripe and activation

The existing holiday webhook URL remains `https://mealplan.yoursouthernfoodie.com/api/holiday/stripe/webhook`. Keep its signing secret in `STRIPE_HOLIDAY_WEBHOOK_SECRET`. The handler processes `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. Existing subscriptions to invoice events may remain; those events are acknowledged without triggering charges.

The deployed holiday endpoint was configured with snapshot events using `2026-09-30.endive`; outbound Stripe SDK requests remain pinned to `2025-02-24.acacia`. Check payment recording using signed events in a matching Stripe test environment before opening orders. A redirect alone does not confirm payment.

After deploying, use Admin → Holiday orders to confirm prices, schedule, pickup address and/or delivery ZIP codes, then enable ordering when ready. Delivery and pickup actions require a fully paid order and only record fulfillment; repeated clicks do not create any additional payment.

The provisional Thanksgiving deadline is November 19, 2026, with fulfillment November 25. Christmas orders close December 18, with fulfillment December 24. Deadlines include the full Eastern calendar day. Holiday parties require at least seven days' notice. These dates and fulfillment details need Chef Netta's confirmation.

## Validation

`npm run typecheck` and the automated suites cover full-payment amounts, the flat dessert price, minimum headcount, consent, stale prices, signature-driven payment verification, duplicate notifications, checkout recovery, admin authorization and fulfillment without Stripe calls. `tests/holiday-orders.sql` checks authoritative database amounts, snapshot immutability, idempotency, disabled balance collection and permissions in an isolated PostgreSQL database after both migrations.

Cancellation and refund automation for holiday catering is not included. The existing weekly-meal cancellation policy is separate.
