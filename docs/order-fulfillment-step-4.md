# Step 4: persistent fulfillment tracking

Step 4 was implemented and tested locally. The owner subsequently applied the migrations to production Supabase and verified Packed and Delivered using a dedicated synthetic fixture. That fixture and its queued notifications have been removed. This release packages the completed admin changes; the delivery-fee-only update was deployed separately. Email delivery remains deferred to Step 5; this step only queues messages.

## Data and behavior

`orders.fulfillment_status` is authoritative: `unfulfilled` (Needs Packing), `packed`, `delivered`. Cancellation is separate. Unpaid/processing orders show payment status and cannot be packed. Paid renewals without meal selections cannot be packed. Pending customer edits/refunds block fulfillment.

For compatibility with existing checkout and customer refund functions, legacy `orders.status` remains `paid`/`packing`/`delivered`/`canceled`. In particular, Packed uses legacy `status = packing`, retaining the existing edit lock and 24-hour cancellation policy. Customer order labels and admin dashboard counts use the fulfillment record.

The authorized server action derives the actor from the verified session. A service-role-only RPC rechecks the administrator role and locks the order row. Database triggers validate the transition and atomically store UTC milestones, append history, queue the notification, and issue containers when delivered. Duplicate requests preserve original timestamps. A unique issuance index prevents more than one issued event per order. Customer balances continue to be maintained by the existing ledger trigger; neither the $50 glass fee nor a prepaid glass credit is converted into a historical refundable deposit.

Holiday orders use the same two explicit actions and outbox/history, while retaining their separate payment and snapshot records. Full payment is required. Existing holiday pickup behavior remains delivery/collection; it creates no weekly glass ledger events.

Admin cancellation of unpaid orders expires any open Stripe checkout first. Paid/processing orders cannot be canceled through a status change; the existing customer cancellation/refund process remains available under its existing policy.

## Historical mapping

| Existing record | New fulfillment | Timestamp treatment |
| --- | --- | --- |
| Paid, unfulfilled | Needs Packing | Existing paid_at retained |
| Packing in progress | Needs Packing | Does not invent a Packed timestamp; edit lock retained |
| Out for delivery | Packed | Packed time unknown |
| Delivered | Delivered | Existing holiday delivery time retained; missing weekly times remain unknown |
| Canceled | Canceled | Historical cancellation time unknown |

Original status values are retained in historical history entries. No historical notification is queued. Replayed historical payment events cannot invent confirmation times or send old confirmations. Existing totals, tax, addresses, portions, and container events are preserved.

The migration fails and rolls back if duplicate container issuances already exist. It does not silently delete ledger entries or alter balances to resolve them.

## Review and production prerequisites

1. Review the local UI and tests; approve Step 4 separately from deploying it.
2. Before any production write, obtain explicit migration/deployment approval and back up the database.
3. Apply `supabase/migrations/20261026_admin_order_notes.sql` if not already applied, then `supabase/migrations/20261027_order_fulfillment.sql` once, after all October 24 migrations. Do not run test/bootstrap files against production.
4. Deploy the compatible admin code only after the migration succeeds. The local modal disables fulfillment actions while the history table is absent. Older admin actions intentionally fail after migration rather than bypassing the workflow.
5. Check a controlled test order through both transitions, refresh to verify timestamps, and inspect its single container issuance. Sending queued emails is not enabled until Step 5 is reviewed.

Required runtime configuration remains the existing Supabase session/service-role and Stripe settings. No new environment variables are required for this step. Production ordering fees remain free for weekly one-time/subscription orders and $10 for holiday delivery.

## Validation

The JavaScript tests cover server authorization/actor identity, RPC delegation and errors, unpaid checkout expiration, refund protection, snapshot displays, and existing checkout/refund/subscription behavior. The SQL suite checks historical mapping, payment eligibility, exact transitions, timestamp preservation, duplicate requests, queues, ledger balances, refund reservations/finalization, holiday snapshot immutability, permission isolation, and transaction rollback after an injected ledger failure. Concurrent sessions check that three simultaneous Packed requests and three Delivered requests produce one event/notification per milestone and one container issuance.

Run JavaScript/type checks from the repository root:

```sh
./node_modules/.bin/tsc --noEmit --incremental false
node --test tests/*.cjs
```

The concurrency test is skipped in the ordinary JavaScript run. For actual database checks, start an isolated PostgreSQL server (no production credentials):

```sh
initdb -D /private/tmp/netta-fulfillment-pg --auth=trust --no-locale
pg_ctl -D /private/tmp/netta-fulfillment-pg -l /private/tmp/netta-fulfillment-pg.log -o '-p 55443 -h 127.0.0.1 -k /private/tmp' start
zsh tests/run-fulfillment-database.zsh
```

If that server is already running, run only the last command. The runner creates a fresh named database, loads synthetic fixtures, and keeps it for review. It never reads `.env.local`. SQL regressions for current sales tax, subscription mix/renewal creation, and holiday full payment run against the migrated schema.

## Rollback considerations

Prefer a forward correction. Do not revert to the old admin status writer after applying this migration. Existing payment functions remain compatible, but the old writer would omit the new RPC and can be rejected. Keep history, outbox rows, milestones, and container ledger entries intact. Do not remove issuance events to undo delivery: deleting an event does not reverse the balance-maintaining insert trigger. An operational reversal needs a separately approved compensating ledger event and explicit history/notification policy. No destructive rollback SQL is included.
