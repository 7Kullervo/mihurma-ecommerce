# Mihurma — Full-Stack E-Commerce Store

A complete e-commerce store: Node.js/Express + MySQL backend, plain HTML/CSS/JS frontend,
an admin panel with guided help, real-time order tracking (Socket.io), and Stripe checkout.

This was built and smoke-tested end-to-end in a sandbox (signup/login, admin product creation
with real multi-image upload, cart, categories, review eligibility) against a real MySQL
database — everything in this README reflects commands that were actually run successfully.

## 1. What you're getting

```
mihurma-ecommerce/
  server/           Express API (auth, products, cart, orders, reviews, admin, uploads)
    schema.sql       MySQL database schema (run this first)
    .env.example     Copy to .env and fill in your values
    scripts/createAdmin.js   Interactive script to create your first admin login
  public/            The website itself (plain HTML/CSS/JS, served by Express)
    index.html, shop.html, product.html, cart.html, login.html, signup.html, dashboard.html...
    admin/           The admin panel (products, orders, customers, dashboard)
```

## 2. Prerequisites

- **Node.js** 18+ and npm
- **MySQL** 8+ running locally or a hosted MySQL (e.g. PlanetScale, Railway, AWS RDS — anything
  except MongoDB, since you asked to avoid that)
- A **Stripe** account (test mode is fine to start) — see the note on regions below

## 3. Setup — step by step

```bash
cd mihurma-ecommerce/server
npm install
```

**Create the database:**
```bash
mysql -u root -p < schema.sql
```
This creates the `mihurma` database, all tables, and a starter set of categories
(Men, Women, Accessories, Electronics, Beauty).

**Configure environment variables:**
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `DB_USER` / `DB_PASSWORD` — your MySQL credentials
- `JWT_SECRET` — any long random string (used to sign login sessions)
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` — from your
  [Stripe dashboard](https://dashboard.stripe.com/apikeys)

**Create your first admin account:**
```bash
npm run seed:admin
```
This asks for a name, email and password in the terminal and creates (or promotes) that
account to `admin`. Use these credentials to log into `/admin`.

**Start the server:**
```bash
npm start
```
Visit `http://localhost:4000` — the storefront, and `http://localhost:4000/admin` for the
admin panel (log in first at `/login.html`, then admin links appear in the header/sidebar).

## 4. Payments — JazzCash QR (manual confirmation)

Checkout has no payment gateway integration right now. Instead:

1. The customer places an order (shipping info only — no card details collected).
2. They land on `payment-pending.html`, showing the order total and a JazzCash QR
   code. They scan it with their JazzCash app and pay directly there.
3. **You replace `public/assets/jazzcash-qr.png` with your real merchant QR** —
   right now it's an obvious placeholder image reminding you to do this. I can't
   generate a real payment QR code for you; it has to be your actual JazzCash one.
4. Since there's no callback from JazzCash telling your server a payment landed,
   **you check your own JazzCash account**, and once you see the payment, go to
   the admin Orders page and click **"Mark as Paid"** on that order.
5. That one click: confirms the order, decrements stock, clears the customer's
   cart, pushes a live update to their `payment-pending.html` page (no refresh
   needed — it flips to "✅ Payment Confirmed" instantly via Socket.io), and fires
   a notification through whichever channels you've set up (see section 6).

I tested this exact sequence end-to-end against a real database: order created →
stayed untouched (no stock change, cart intact) while pending → admin clicks Mark as
Paid → stock decremented, cart cleared, status moved to "Being Prepared", a second
click correctly rejected ("already confirmed").

### Tracking numbers (Pakistan Post / EMS)

Each order row in the admin Orders page has a small text box for a tracking number.
Once you have one (from Pakistan Post or whichever courier), type it in and click
**Save** — the customer is immediately notified with a message containing the number
and a link to track it at [ep.gov.pk](https://ep.gov.pk/). It also shows up right on
their dashboard order card, live, via the same Socket.io connection.

### If you ever want card payments back

The Stripe integration (and an EasyPaisa starting point) still exist in
`server/payments/` — they're just disconnected from the live checkout flow, not
deleted. Reconnecting one means routing `routes/orders.js`'s `/checkout` through
`payments/index.js` again (this is exactly how it worked before this change) — ask
me when you want that back and I'll wire it back in.

## 5. How real-time order tracking works

Orders now move through this exact flow, matched to buttons in the admin panel:
**Payment Pending → Product Being Prepared → Product Prepared → Product On The Way →
Product Might Be Delivered Today → Delivered** (or **Cancelled** at any point).

When an admin clicks a status button in `/admin/orders.html`, three things happen at once:
1. The database is updated and the change is logged to `order_status_history`
2. A Socket.io event pushes the update to that customer's `/dashboard.html` instantly
3. The customer is notified through every notification channel you've configured (see below)

**⚠️ If you already had a database from before this update**, don't re-run `schema.sql`
(that would wipe your products/orders) — instead run these one-time migrations, in order:
```bash
mysql -u root -p -h 127.0.0.1 mihurma < migration_couriers_and_statuses.sql
mysql -u root -p -h 127.0.0.1 mihurma < migration_tracking_number.sql
```
The first safely remaps your existing orders to the new status names and adds the
`couriers` table. The second adds the `tracking_number` column used for the
Pakistan Post / ep.gov.pk tracking feature (see section 4). Both were tested directly
against a simulated copy of an older schema before being included here.

### Assigning couriers

The admin Orders page has a "Couriers" section at the top — add a courier's name and
(optional) phone number once, then assign them to any order via the dropdown in that
order's row. Deleting a courier automatically un-assigns them from any orders (nothing
breaks — the order just shows "Unassigned" again).

## 6. Notifications — Email, SMS, WhatsApp, Push

Customers can optionally be notified on every status change through up to four channels.
**Every channel is fully optional and independent** — leave its environment variables
blank in `.env` and it silently does nothing (no errors, no crashes).

All four live in `server/notifications/channels/`, wired together in
`server/notifications/index.js`. **To permanently remove a channel** (say, you decide
you'll never use WhatsApp): open `server/notifications/index.js` and delete (or comment
out) that one `require(...)` line in the `channels` array at the top. Nothing else in the
codebase needs to change — the other channels, the admin panel, and order tracking all
keep working exactly as before.

| Channel | Env vars needed | Where to get them |
|---|---|---|
| Email (Nodemailer) | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Any SMTP provider — Gmail, SendGrid, Mailgun, etc. |
| SMS (Twilio) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | [console.twilio.com](https://console.twilio.com) |
| WhatsApp (Meta Cloud API) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| Push (Firebase) | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service Accounts |

Push notifications additionally need the customer's browser to have registered a device
token first (via `POST /api/auth/push-token`) — this requires a small amount of
frontend setup (requesting notification permission + a service worker) that isn't wired
up yet in the UI. The backend endpoint and channel are ready to go; ask me when you're
ready to add the frontend piece.

All four channels can be active at once — a status change will email, text, WhatsApp,
and push-notify the same customer if you've configured all of them.

## 7. Security notes (read this before going live)

Implemented: bcrypt password hashing (12 rounds), httpOnly+sameSite auth cookies, JWT
sessions, parameterized SQL everywhere (no string-built queries), role-checked admin routes
on the *server* (not just hidden UI), rate limiting on login/signup, file-type/size validation
on uploads, Stripe webhook signature verification, Helmet security headers.

Before a real launch, you should additionally: serve over HTTPS and set `COOKIE_SECURE=true`,
put the server behind a reverse proxy (nginx/Caddy), set stricter CORS if the frontend moves
to a different domain, and consider a managed WAF. No system is "unhackable" — this gives you
a solid, honest baseline.

## 8. Admin panel — how it works

Everything in `/admin` requires an admin login (enforced server-side). The left sidebar has a
"Quick Help" box that changes per page with plain-English instructions. Adding a product:
title/price/description → click the upload box or drag photos in directly from your device
(no image URLs needed) → click any photo to make it the main thumbnail → Save. Multiple
photos are fully supported (up to 8, 5MB each).

## 9. Design

Royal brown (`#3E2416`) and royal gold (`#C9971C`) throughout, Fraunces (serif) for headings
and Inter for body text. Light/dark mode toggle in the header (persists across visits). The
flower-bloom loader is used anywhere content is being fetched. Hovering a product card fades
up a "Buy" button, matching your reference screenshots.

## 10. What to do next

1. Run through setup above locally.
2. Add real product photos via the admin panel.
3. Swap the placeholder `picsum.photos` hero/category images in `public/index.html` and
   `public/login.html`/`signup.html` for your own brand photography.
4. Point `CLIENT_URL` at your real domain and deploy (any Node host — Render, Railway,
   a VPS with PM2, etc. — plus a managed MySQL instance).
