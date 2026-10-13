# The Holiday Cheat Sheet

Implemented on `codex/holiday-cheat-sheet`, separate from the customer-account rollout. The home banner, desktop/mobile navigation, and footer link to `/holiday-cheat-sheet`. Photo areas have black backgrounds; promotional paragraphs use lorem ipsum as requested.

## Pricing and package

- Initial draft: $16 per person, at least 15 people, $300 minimum order total.
- One entrée, both sides, one bread/dressing, and one dessert.
- Optional second dessert: $5 per person. Selecting it adds the other dessert automatically.
- Customers pay a 50% deposit at checkout. The exact remaining balance is charged when an admin marks the order delivered, or collected for pickup.
- An odd cent is allocated to the deposit; the balance is the exact remainder.
- Admins can change package pricing, minimum total, minimum people, dessert pricing and its basis (per person/per order), delivery fee, dates, pickup location, and eligible delivery ZIP codes.
- Prices apply to new checkouts. Stored order amounts, selections, and payment consent cannot be altered by later settings changes. Stale checkout prices are rejected so customers review the current amount.
- The $300 minimum applies to the complete order total, including extras and delivery. Any adjustment to meet that minimum appears in the package charge and is explained in the summary.

Examples without delivery fees:

| People | Desserts | Total | Deposit | Balance |
| ------ | -------- | ----- | ------- | ------- |
| 15     | One      | $300  | $150    | $150    |
| 15     | Both     | $315  | $157.50 | $157.50 |
| 25     | One      | $400  | $200    | $200    |
| 25     | Both     | $525  | $262.50 | $262.50 |

## Provisional schedule

- Thanksgiving: order by November 19, 2026; pickup/delivery November 25.
- Christmas: order by December 18, 2026; pickup/delivery December 24.
- Holiday parties: at least seven days' advance notice, within the next year.

Deadlines include the full Eastern calendar day. These dates remain drafts until Chef Netta confirms them. Calendar reference: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/

## Activate after review

1. Apply `supabase/migrations/20261012_holiday_orders.sql` in Supabase SQL Editor. It creates holiday pricing and private holiday orders, separate from weekly-meal container deposits and subscriptions. Defaults leave ordering closed.
2. Configure a Stripe webhook destination at `https://mealplan.yoursouthernfoodie.com/api/holiday/stripe/webhook`, API version **2025-02-24.acacia**. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required`.
3. Save that endpoint's signing secret as `STRIPE_HOLIDAY_WEBHOOK_SECRET` in the deployment environment. Keep the existing `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_SITE_URL`. Test and live keys must match the webhook's environment. Do not reuse another endpoint's signing secret.
4. Deploy this feature branch through the normal review process. It does not depend on the unfinished customer-account branch.
5. Go to **Admin → Holiday orders**. Confirm pricing, dates, pickup location, delivery fee, and delivery ZIP codes. A blank pickup location disables pickup at checkout; no delivery ZIPs disables delivery. Tick **Open holiday ordering** and save only when ready.
6. Run a Stripe test checkout with one dessert and another with both desserts. Confirm deposit webhooks record payment. Mark a test order delivered/collected and verify its balance invoice is charged exactly once. Repeat the admin action and test a declining card/customer authentication scenario.

The migration has been tested locally, not applied to production. No real payment has been taken, and the draft has not been deployed.

## Fulfillment and failures

The admin action clearly confirms that delivery/collection triggers the balance charge. Holiday fulfillment and payment statuses are separate. A card failure leaves the order delivered but the invoice unpaid and exposes a hosted payment link. An admin may retry the existing invoice or share its link with the customer. A bank requiring authentication must be completed by the customer.

Billing uses one saved card for the specific authorized order. The app records the exact consent text and accepted amount. Checkout deposits are confirmed by signed webhooks, not a browser redirect. Database billing locks, durable Stripe IDs, recovery of lost responses, and Stripe idempotency keys prevent duplicate sessions/invoices/payments during retries. Out-of-order invoice events retrieve Stripe's current invoice state.

Cancellation/refund automation and order changes after a deposit are not included in this holiday feature. Any catering cancellation/refund terms and traditional-catering service arrangements need Chef Netta's confirmation before launch.

## Validation

Run `node --test tests/holiday-orders.cjs tests/admin-meal-library.cjs`, `npm run typecheck`, and `npm run build` with the existing environment settings. `tests/holiday-orders.sql` runs against an isolated PostgreSQL database after applying the migration and rolls its fixtures back.

Stripe references:

- https://docs.stripe.com/payments/save-during-payment
- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/api/invoices/create
- https://docs.stripe.com/api/invoices/pay
