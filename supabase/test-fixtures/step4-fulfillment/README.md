# Dedicated Step 4 manual-verification fixture

Approved by the user for production Supabase project `bwamqfnsorygmnrtqjnm`. This directory contains synthetic information only, with no credentials or real customer data.

- Label: **TEST ONLY — Step 4 Fulfillment 9e716037**
- Order: `9e716037-4456-44dd-9f68-1cb6469eab95`
- Customer: `7825c77e-1bcd-44bd-8b0e-a05d8c25d266`
- Email: `step4-fulfillment-9e716037@example.invalid` (reserved invalid domain)
- Simulated total: $121.25. No money collected; no Stripe references exist.

The creation script inserts only this dedicated guest customer, one order, two saved meal items, a private note, and trigger-generated history/notification records. The initial confirmation notification is held with `available_at = infinity`. No auth signup or Stripe API is used. Existing menu rows are read, never edited. The fixture temporarily appears in production order totals and queues until it is removed.

## Current status

Manual fulfillment verification passed. The production fixture and its queued notifications were removed using the approved cleanup transaction before Step 5. The scripts remain as a reviewable record; do not rerun creation without approval.

## Manual check

1. Open the local `/admin/orders` screen and find the exact label above.
2. Open its modal. Confirm Half (serves 2), quantity 2, $8.00 each; Whole (serves 4), quantity 1, $46.00 each; food $62.00, glass fee $50.00, tax $9.25, delivery $0, simulated total $121.25.
3. Confirm Needs Packing and no issued containers in the ledger.
4. Select **Mark as Packed** and refresh. Confirm Packed, a packing timestamp, and no container issuance.
5. Select **Mark as Delivered** and refresh. Confirm Delivered, a delivery timestamp, one issued event with quantity 3, customer containers out 3, and refundable deposit held $0.
6. Stop and report completion. Do not create customer refunds or change menu records.

Packed and Delivered each queue a notification. There is no email sender implemented or deployed for this workflow at fixture creation. The preflight found no Edge Functions, database scheduler, pg_net extension, or outbound trigger calls. Do not enable Step 5 delivery until this fixture and all its notification rows have been removed.

## Scripts and lifecycle

- `preflight.sql`: read-only trigger/scheduler/outbox audit.
- `create.sql`: exact-ID creation, no upserts; identity conflicts, changed triggers/prices, or a potentially active sender cause rollback.
- `verify.sql`: read-only fixture summary, safe before and after fulfillment/cleanup.
- `cleanup.sql`: privileged, exact-ID transaction. Run only when manual review is finished and cleanup is authorized. It refuses unexpected account/payment/related activity, removes dependent notification/history rows first, and removes the entire dedicated customer so no surviving container balance is left inconsistent. It never deletes menu rows or updates another customer.

Creation and cleanup were tested against an isolated PostgreSQL database, including Packed and Delivered. Do not automatically execute cleanup when reading this file.
