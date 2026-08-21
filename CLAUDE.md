# Netta's Pantry — meal prep service

Context for Claude Code. Read this before making changes.

## What this is

A weekly meal-prep ordering site for **Chef Netta** (Netta's Pantry), delivering
chef-prepared Southern food across **North Carolina only**. Meals ship in reusable
glass containers that customers return for their next order.

The existing marketing/catering site is WordPress at <https://yoursouthernfoodie.com>.
This app is a separate Next.js project that will be linked from that site's navigation
and home page. Keep the branding consistent with Netta's Pantry: warm, Southern,
"rooted in community, grown with love."

The customer-facing menu UX is deliberately modeled on CookUnity: a horizontal row of
filter chips above a grid of meal cards, clicking a card opens a modal with ingredients
and allergen badges, and the modal has a "View more meal details" button linking to a
full page.

## Decisions already made — don't relitigate these

| Decision | Choice |
| --- | --- |
| Stack | Next.js 14 App Router, TypeScript, Tailwind, Supabase (Postgres), Stripe |
| Ordering | **Both** weekly subscription and one-time boxes |
| Plan sizes | 6 / 8 / 12 meals per week, cheaper per meal as size increases |
| Containers | **Refundable deposit**, $3.00 per container |
| Deposit timing | Subscribers pay once (they swap empties for fulls); one-time buyers pay per order |
| Delivery area | North Carolina ZIPs only (27006–28909) |
| Admin scope | Meal CRUD, weekly menu publishing, order fulfillment, customer + container tracking |

All prices, plan tiers, filter definitions, and the ZIP check live in
`src/lib/constants.ts`. Change them there, never inline in components.

## Architecture notes

- **`src/lib/constants.ts`** — single source of truth for business rules.
- **`src/lib/cart.tsx`** — client-side cart context. Enforces that a subscription
  cart can't exceed the chosen plan size.
- **`src/lib/supabase/server.ts`** — exports `createServerClient()` (anon key, RLS
  enforced, no cookies — public reads only), `createSessionClient()` (anon key, RLS
  enforced, cookie-aware — use this anywhere you need to know who's signed in), and
  `createAdminClient()` (service role, **bypasses RLS**). Never import
  `createAdminClient` into a `'use client'` file.
- **Auth** (`src/app/auth/`) — magic link is fully working; Google/Apple buttons are
  wired but inert until real OAuth credentials are added in Supabase's dashboard (see
  README). Two separate routes handle the redirect back from Supabase because OAuth
  and magic link use different verification flows: `auth/callback` (OAuth, a `code`
  param, `exchangeCodeForSession`) and `auth/confirm` (magic link, `token_hash` +
  `type`, `verifyOtp`) — don't collapse these into one route. Both call the shared
  `afterAuth()` in `auth/after-auth.ts`, which promotes `profiles.role` to `'admin'`
  for any email in `ADMIN_EMAILS` (promotion-only — removing an email later doesn't
  demote, see README) and links any guest `customers` row sharing that verified email
  by setting `auth_user_id`. `profiles` rows are created automatically by a trigger
  on `auth.users` insert (`supabase/schema.sql`), always starting as `'customer'`.
  `middleware.ts` at the project root refreshes the session cookie on every request.
- **`src/app/admin/actions.ts`** — all admin mutations as server actions.
- **`supabase/schema.sql`** — schema plus RLS policies. `container_events` is an
  append-only ledger; a trigger keeps `customers.containers_out` and
  `deposit_held_cents` in sync, so never update those columns directly — insert a
  container event instead.
- **Pricing is recalculated server-side** in `src/app/api/checkout/route.ts`. Never
  trust a price sent from the browser.
- **Meal photos** upload to the `meal-photos` Supabase Storage bucket via
  `uploadMealPhoto()` in `src/app/admin/actions.ts`, using the service role — the
  bucket itself needs no public write policy. The admin form still has a "Photo URL"
  field as a fallback for pasting an external link.
- **`meal_sizes`** holds optional size/price variants per meal (e.g. Regular vs.
  Family), edited in the admin meal form via `MealSizesEditor`. `saveMeal` replaces a
  meal's whole size list on every save (delete + reinsert) rather than diffing. A meal
  with no rows here just uses its single `price_cents`. **Not yet wired to the
  customer side** — `/menu`, the meal modal, cart, and checkout still only ever use
  `meals.price_cents` and have no size picker.

## Known gaps — the real work remaining

1. ~~The admin panel has no authentication.~~ **Done** — `/admin` is gated by
   `profiles.role = 'admin'`, and customers can sign in at `/login` / `/account`. See
   the Auth note above and the README's "Signing in" section.
2. **No Stripe webhook.** Orders are created as `pending` and only advance when the
   chef clicks through statuses. A webhook on `checkout.session.completed` should flip
   orders to `paid` automatically.
3. **Deposit refunds are logged, not executed.** `logContainerReturn` records the
   ledger event but doesn't call the Stripe refund API yet.
4. **Weekly menus aren't wired to the customer menu page.** `/menu` currently shows all
   active meals. It should show the published `weekly_menu` for the current week.
5. **Customer accounts are sign-in + order history only.** Checkout itself is still
   guest-only (it doesn't check for a session), and a signed-in customer can view
   past orders at `/account` but can't yet skip a week or manage a subscription.
6. **Subscriptions aren't truly recurring.** Stripe is called in `subscription` mode,
   but there's no logic to generate each week's order or let customers choose meals for
   the coming week.
7. **Meal sizes aren't customer-facing yet.** The admin form can store multiple
   size/price variants per meal (`meal_sizes`), but `/menu`, the meal modal, cart, and
   checkout all still price and sell a meal at its single `price_cents` only. A
   customer has no way to pick a size.
8. **No tests.**

## Conventions

- Server components by default; `'use client'` only where interactivity requires it.
- Money is always stored and passed as integer cents. Format with `formatCents()`.
- Tailwind only, no CSS modules. Custom colors: `ink`, `cream`, `moss`, `clay`.
- Comments should explain *why*, not restate the code.
