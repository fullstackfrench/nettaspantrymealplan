# Netta's Pantry — meal prep ordering site

A weekly meal-prep service for Chef Netta. Customers browse a rotating menu, choose a
subscription plan or a one-time box, and receive meals in reusable glass containers that
they return for their next order.

Delivers within North Carolina only.

---

## Getting it running

You'll need [Node.js](https://nodejs.org) 18 or newer.

### 1. Install dependencies

```bash
cd nc-meal-prep
npm install
```

### 2. Set up Supabase (the database)

1. Create a free account at [supabase.com](https://supabase.com) and start a new project.
2. In the dashboard, open **SQL Editor** and paste in the contents of
   `supabase/schema.sql`. Run it. This creates all the tables.
3. Optionally paste in `supabase/seed.sql` and run it too — that gives you six sample
   meals so the site isn't empty.
4. Go to **Project Settings → API** and copy three values: the Project URL, the `anon`
   public key, and the `service_role` secret key.

### 3. Set up Stripe (payments)

1. Create an account at [stripe.com](https://stripe.com).
2. Grab your **test mode** keys from the [API keys page](https://dashboard.stripe.com/test/apikeys).

You can skip this for now — without a Stripe key the site records orders but doesn't
take payment, which is fine for testing the flow.

### 4. Add your environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste in the values from steps 2 and 3.

### 5. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. The chef dashboard is at
<http://localhost:3000/admin>.

---

## What's built

**Customer side**

- Home page explaining the glass-container model
- `/menu` — filter chip bar, meal cards, click-to-open modal with ingredients and
  allergen badges, "View more meal details" button
- `/meals/[slug]` — full meal detail page
- `/checkout` — order review, NC ZIP validation, deposit broken out as its own line
- Plan picker toggling between weekly subscription (6/8/12 meals) and one-time boxes

**Chef side** (`/admin`)

- Dashboard: meal count, orders to fulfill, containers out, deposits held
- **Meals** — add, edit, hide, and delete meals with photos, macros, ingredients,
  allergen badges, and filter tags
- **Weekly menus** — create a week, tick which meals you're cooking, publish it
- **Orders** — move orders through packing → out for delivery → delivered
- **Customers & glass** — see who holds how many containers, log returns, refund or hold
  deposits, mark containers as not returned

---

## How the deposit works

A refundable **$3.00 per container** is added at checkout. It is not a fee — the
customer gets it back.

- **Subscribers** pay it once. After the first week they swap empties for fulls, so they
  never hold more than one set. The checkout API only charges for containers the
  customer doesn't already have out.
- **One-time buyers** pay it each order and get it back when the glass returns.

Every container movement is recorded in the `container_events` table — issued, returned,
or lost — and a database trigger keeps each customer's running balance accurate. That
means you can always audit where the glass went instead of trusting a single counter.

To change the amount, edit `DEPOSIT_PER_CONTAINER_CENTS` in `src/lib/constants.ts`.

---

## Signing in — admin and customers

`/admin` is gated by Supabase Auth, and customers can sign in at `/login` (Google,
Apple, or a magic link) to see their order history at `/account`. Every new sign-in
gets a row in `profiles` (`role` defaults to `'customer'`); anyone whose email is
listed in the `ADMIN_EMAILS` env var is promoted to `role = 'admin'` the moment they
sign in — see `src/app/auth/after-auth.ts`.

### Get Chef Netta into the admin panel

1. Set `ADMIN_EMAILS` in `.env.local` to her email (comma-separated if there's more
   than one admin).
2. Have her go to `/login` and sign in with a magic link using that same email —
   Google/Apple aren't required for this, just whichever is easiest for her.
3. That's it — her first sign-in creates her `profiles` row and promotes it to admin
   in the same request. `/admin` is now hers; anyone else who signs in still lands on
   the plain customer `/account` page.

Removing an email from `ADMIN_EMAILS` does **not** demote an existing admin — that's
a one-time manual step if it ever comes up:
```sql
update profiles set role = 'customer' where id = (select id from auth.users where email = '...');
```

### Turning on Google and Apple sign-in

Both buttons are already wired up on `/login` — they just need credentials in
Supabase before they'll work. Until then, clicking them will show a "provider not
enabled" error, which is expected.

1. **Supabase Dashboard → Authentication → URL Configuration** — add
   `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/confirm` to
   Redirect URLs (plus your real domain's equivalents once deployed), and set the
   Site URL to match.
2. **Google** — create an OAuth Client ID (Web application) in
   [Google Cloud Console](https://console.cloud.google.com/), with authorized
   redirect URI `https://<your-project-ref>.supabase.co/auth/v1/callback`. Paste the
   Client ID and Secret into **Supabase Dashboard → Authentication → Providers →
   Google**.
3. **Apple** — more involved: create a Services ID and a "Sign in with Apple" key in
   the [Apple Developer portal](https://developer.apple.com/account/), which needs a
   Team ID, Key ID, private key, and domain verification pointed at the same
   Supabase callback URL above. Paste all of that into **Supabase Dashboard →
   Authentication → Providers → Apple**.

---

## Deploying

Push to GitHub, then import the repo at [vercel.com](https://vercel.com). Add the same
environment variables from `.env.local` in the Vercel project settings. Set
`NEXT_PUBLIC_SITE_URL` to your real domain.

Once it's live, add a link from the WordPress site at yoursouthernfoodie.com — either a
subdomain like `order.yoursouthernfoodie.com` pointed at Vercel, or a plain nav link.

---

## What still needs building

See `CLAUDE.md` for the full list. The big ones:

1. Admin authentication (above)
2. A Stripe webhook so paid orders update themselves
3. Actually issuing deposit refunds through Stripe, not just logging them
4. Wiring `/menu` to the published weekly menu instead of all active meals
5. Customer accounts — order history, skipping a week, managing a subscription
6. Letting customers actually pick a meal size — sizes/prices can be set per meal in
   `/admin` now, but `/menu` and checkout still only charge the meal's single price
