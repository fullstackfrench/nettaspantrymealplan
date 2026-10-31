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

## Next stage, after the test is approved

Customer broadcasts are intentionally unavailable. The next stage must add
subscriber import with recorded menu-announcement consent, suppression handling,
a real unsubscribe link, recipient counts, explicit publish/notify approval,
and persistent per-menu delivery tracking before any customer send. Existing
order notification work remains separate. This preview/test implementation must
not be reused for customer broadcasts without those additions.

## Validation

`node --test tests/menu-email.cjs` verifies stored-price rendering, escaping,
authorization, verified administrator-only recipients, unavailable meals,
configuration errors, provider failures, and stable retry keys. Browser checks
use simulated providers and send no real email.

Rollback: reverting this feature removes preview/test controls; it does not
change menu records, customers, orders, or Resend subscribers.
