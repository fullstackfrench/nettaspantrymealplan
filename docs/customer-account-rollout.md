# Customer account rollout

The account implementation adds password registration and sign-in, emailed sign-in links, password reset, Google sign-in when the provider is enabled, saved delivery details, current and past orders, order edits and cancellation, and subscription controls. Guest checkout remains available.

## Business rules

- Customers can cancel an order only within 24 hours of its creation. The cutoff is enforced using the database clock, even if a customer changes their browser clock.
- Meal, quantity and address edits use the same 24-hour window and close once preparation begins. Cancellation remains available during preparation within the window; shipped or delivered orders cannot be canceled.
- The policy is visible at checkout, on the payment-return page, and in the account dashboard. Eligible orders show their exact cancellation deadline.
- Paid order price increases require an additional Stripe payment before the new details are applied. Price reductions and cancellations submit refunds against the actual original payment and any prior adjustment payments. Refund retries reuse the same identifiers.
- Pending changes reserve the order and block kitchen fulfillment until settled. Customers can continue a pending change. A pending edit that has not settled can be discarded when no refund has started and no additional payment is processing.
- Subscription quantity changes must preserve the order's meal count. To change the number of meals in future weeks, change the subscription plan.
- Pausing or skipping a subscription voids future invoices during the pause. Skipping covers the next single weekly billing cycle, then collection resumes. These actions do not cancel orders already placed.
- Subscription cancellation is scheduled for the end of the current paid billing period. Existing orders must be canceled separately within their own 24-hour window.
- Plan changes have no immediate proration; the new recurring price applies on the next bill. Existing orders retain their prices and quantities.
- Upcoming choices must match the plan's meal count and a published upcoming menu. Selection closes when that menu week starts in America/New_York. Renewal invoices create one order per Stripe invoice using the saved choices. Missing or invalid choices are flagged for customer selection and prevent kitchen preparation.
- Account ownership always comes from the server-verified Supabase session. User-provided roles, email addresses, customer IDs, prices, and fees do not confer account access or admin privileges. Verified account email may claim matching guest history.

## 1. Apply the database migration

Open the project SQL Editor in Supabase and run `supabase/customer-account-rollout.sql` in its entirety. It combines the pricing foundation, checkout preparation, account-management, and billing migrations in one transaction. It adds fields/tables and replaces functions; it does not delete existing meals, customers or orders.

This step must happen **before** deploying the application code. The application now reads the account tables and calls these RPCs. The service-role API key is sufficient for application reads/writes but does not give this workspace a PostgreSQL migration connection. Apply the script in the SQL Editor, or configure an approved database connection outside chat.

## 2. Configure Supabase authentication

Under Authentication → URL Configuration:

- Site URL: `https://mealplan.yoursouthernfoodie.com`
- Allowed redirects: `https://mealplan.yoursouthernfoodie.com/auth/confirm` and `https://mealplan.yoursouthernfoodie.com/auth/callback` (include query-string variants according to your dashboard's redirect matching settings).
- Add equivalent development redirects if testing locally.

Keep email sign-up enabled and require email confirmation. Set the project's minimum password length to 8; the signup and reset forms use that minimum. Configure the production SMTP sender and verify delivery of signup, sign-in and recovery emails. Keep the default ConfirmationURL email links or a compatible token_hash/type link supported by `/auth/confirm`.

Google is currently disabled in the connected Supabase project. To enable it:

1. In Google Cloud, configure the OAuth consent screen and create a Web application OAuth client. Add appropriate test users if the consent screen is in testing mode.
2. Set the authorized redirect URI to the callback shown by the Supabase Google provider. For this project it is `https://bwamqfnsorygmnrtqjnm.supabase.co/auth/v1/callback`.
3. In Supabase Authentication → Sign In / Providers → Google, enter the Google client ID and client secret and enable Google.
4. The app displays “Continue with Google” when Supabase reports the provider enabled. Customer callbacks open `/account`; checkout sign-in returns to checkout.

Reference: https://supabase.com/docs/guides/auth/social-login/auth-google
Password recovery: https://supabase.com/docs/guides/auth/passwords

## 3. Configure Stripe

Use matching Stripe keys and webhook secrets for each environment. The local key is in test mode; production mode must be configured and verified separately.

Create a webhook destination for `https://mealplan.yoursouthernfoodie.com/api/stripe/webhook` with API version matching Stripe SDK 17 (2025-02-24.acacia), subscribed to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Set that destination's signing secret as `STRIPE_WEBHOOK_SECRET` in Vercel. Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_SITE_URL` for the target environment. Set up the Stripe customer portal so customers can manage payment methods and invoices. The app's subscription controls handle skip, pause, resume, cancellation and plan changes. Active plan prices are created/reused idempotently from server-side plan records; existing subscription price snapshots are retained until the customer changes plans.

Webhooks must be reachable and configured before customer tests involving payments. A successful checkout redirect alone is not payment confirmation. Signed events validate payment amounts and settle order changes; failed processing returns a retryable response and records the error.

## 4. Deploy and test

After migration and provider/webhook configuration, deploy the customer-account branch. Then test in Stripe test mode:

1. Create a customer with email/password, confirm the email, sign in and reset the password.
2. Sign in by email link and Google. Confirm the customer cannot access `/admin`.
3. Check out as a guest with a fresh email, verify that email through signup/sign-in, and check that the guest order appears in account history. Guest checkout also works for an existing account email without exposing saved payment methods or past orders. History access still requires verifying that email.
4. Place an account order and verify delivery details, paid status and line-item size/serving snapshots.
5. Within 24 hours, edit an address, replace a meal, and change quantities. Verify extra payment and refund cases and retry delivery of the same webhook.
6. Cancel within the window and verify the original payment's refund. Confirm cancellation is rejected at the exact 24-hour cutoff. Confirm completed/shipped orders and another customer's orders cannot be changed.
7. Start a weekly subscription; confirm it appears in the account. Test pause/resume, skip next week, plan changes and scheduled cancellation.
8. Publish an upcoming menu, save the exact plan quantity, and trigger a test renewal invoice. Verify one renewal order appears, and duplicate events do not create duplicates. A plan change invalidates saved choices with the wrong meal count.
9. Check kitchen fulfillment cannot proceed while a change is reserved or meal selection is missing.

## Verification performed in the workspace

- TypeScript checks.
- Automated policy/auth checks for deadline boundaries, order states, verified email, roles and safe redirects.
- Signed-webhook, amount-validation, duplicate-delivery and refund-retry regression tests.
- Actual PostgreSQL tests of migrations, ownership checks, authoritative prices, order-change reservations, atomic item/address updates, cancellation, subscription synchronization, meal selection and renewal idempotency.
- Mocked auth UI tests cover email/password, signup, sign-in links, recovery and Google callback construction. Real email delivery, Google consent, and hosted Stripe payment flows require the configured environments above.

No production migration, live charge, refund or subscription change has been performed as part of these tests.
