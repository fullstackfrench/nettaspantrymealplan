# Weekly menu email preview and administrator tests

This first stage adds **Preview menu email** to Admin → Weekly Menus. It reads
saved dishes, active purchase sizes and prices, skips sold-out/unavailable meals,
and shows the selected week's Monday 8 p.m. Eastern deadline. Previewing a draft
does not publish it. Publishing still does not send emails.

## Configuration

- `RESEND_API_KEY`: server-only Resend key, already configured in Vercel Production.
- `NEXT_PUBLIC_SITE_URL`: existing site origin, used for the `/menu` button.
- From: `Chef Netta <chefnetta@yoursouthernfoodie.com>`.
- Reply-to: `chefnetta@yoursouthernfoodie.com`.
- Footer: `2161 South Wilmington St., Raleigh, NC 27603`.

The sender domain must be verified in the Resend account owning the API key.
No database migration or new dependency is required.

## Review and testing

1. Deploy only after approval.
2. Sign in as an administrator, open the intended menu week, and choose
   **Preview menu email**.
3. Review dish names, saved prices, deadline, business address and sender details.
4. Choose **Send test to my inbox**. The destination is the authenticated
   administrator's verified email, resolved on the server; no recipient list or
   arbitrary destination is accepted from the browser.
5. Check inbox/spam and confirm appearance and replies. Resend acceptance is
   reported separately from delivery; delivery details remain in Resend's logs.

Test subjects begin `[TEST]`, and the email states whether the menu is still a
draft. Its order button opens the currently published public menu. Failed or
ambiguous test requests retain the same request ID for retries; the server adds
an administrator/menu/content-specific Resend idempotency key (24-hour provider
retention). Closing the dialog is disabled while sending. Reloading the page
starts a new request; this is not a persistent customer-send ledger.

## Customer announcements

The next local implementation adds **Publish & Notify Customers**. It is not
active in production until the migration and deployment are approved.

- Subscriber segment: `aa952e1a-0da7-4c8d-9455-041df327a843`
  (`Netta's Pantry — Weekly Menu Announcements`). Seven previous customers were
  imported on October 31, 2026, based on the owner's confirmation that they
  signed up for menu announcements. Original signup dates were not inferred.
  Staff and test contacts were excluded.
- Counts come from the live segment, excluding global unsubscribes and Resend
  suppressions. Resend also applies its suppression rules at delivery time;
  the reviewed number is an upper bound, since customers can unsubscribe.
- Customer emails contain the Resend-managed `{{{RESEND_UNSUBSCRIBE_URL}}}` link.
- A signed, administrator-specific confirmation expires after 15 minutes. The
  saved menu content and eligible recipient list are checked again at send time.
- A service-only database reservation publishes the menu and permits one
  announcement per menu week. Ordinary publishing still sends no email.
- A Resend draft is created first, and its ID is saved before sending. Concurrent
  clicks, page reloads, menu edits and unpublish/republish cannot create another
  announcement after an accepted send.
- **Check announcement status** only reads the existing broadcast; it never sends
  another copy. Network ambiguity fails closed. A definite rejection of draft
  creation can be reviewed for retry; uncertain creation or delivery needs review
  in Resend. Delivery, bounces and complaints remain visible in Resend.

### Release, after explicit approval

1. Apply `supabase/migrations/20261031_menu_announcements.sql` to Supabase. It adds
   a private ledger and service-only RPCs, with no sending triggers. Existing menu
   records, customers, order data and fulfillment are preserved.
2. Deploy the application. Keep `RESEND_API_KEY` configured in Production with
   contact and broadcast permissions and the verified sender domain.
3. The imported segment is the default. `RESEND_MENU_SEGMENT_ID` is optional and
   should only be set when intentionally changing the approved subscriber list.
4. Open the target week, select **Publish & Notify Customers**, review the actual
   customer email and count, and tick the approval checkbox.
5. The administrator's final **Publish & Send to N Customers** click is the send
   authorization. No customer announcement is sent during deployment or preview.

Do not announce closed weeks or an older menu when a newer menu is published.
The public ordering link continues to use `/menu`.

### Failure review

The menu may remain published if Resend rejects or cannot confirm a send. Do not
manually clear a reservation to bypass a warning. First check Resend for the
saved broadcast ID, or the deterministic name
`netta-menu-<menu ID>-<announcement ID>` when draft creation was unconfirmed.
A saved unsent draft can be handled in Resend; then use the status check to
reconcile accepted sends. An operator may repair a failed reservation only after
establishing that no duplicate draft/send is possible.

Rollback the application without dropping the ledger or deleting its rows.
Retain all broadcast IDs and reservations to preserve duplicate protection.
Queued emails cannot be recalled by a code rollback; cancellation is managed in
Resend.

## Validation

`node --test tests/menu-email.cjs tests/menu-announcements.cjs` verifies stored-price rendering, escaping,
authorization, verified administrator-only recipients, unavailable meals,
configuration errors, provider failures, and stable retry keys. Browser checks
use simulated providers and send no real email. `zsh tests/run-menu-announcement-database.zsh`
checks SQL authorization, snapshots, deadlines, publish/claim behavior, safe retry
states, and simultaneous reservations against a fresh isolated local database.
It never loads `.env.local` or connects to production.

Rollback: reverting this feature removes preview/test controls; it does not
change menu records, customers, orders, or Resend subscribers.
