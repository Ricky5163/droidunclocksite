# Droidunclock

Premium international phone repair and e-commerce platform for refurbished phones, mobile parts, and repair services.

## Structure

- `index.html` - premium multilingual landing page
- `shop.html` / `js/shop.js` - category store with cart and buy-now flow
- `product.html` / `js/product.js` - product detail page with gallery, warranty, delivery, and related products
- `cart.html` / `js/cart.js` - localStorage cart with subtotal, shipping, and total
- `checkout.html` / `js/checkout.js` - customer checkout with Stripe and PayPal redirects
- `admin.html` / `js/admin.js` - Supabase Auth admin dashboard for products and orders
- `functions/api/*` - Cloudflare Pages Functions for Stripe, PayPal, webhooks, and email hooks
- `supabase-schema.sql` - database tables, RLS policies, indexes, and admin setup

## Environment Variables

Set these in Cloudflare Pages:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLIC_KEY=
STRIPE_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
SITE_URL=https://your-domain.com
INTERNAL_API_SECRET=
CHECKOUT_DATA_SECRET=
SHIPPING_COST=9.95
FREE_SHIPPING_THRESHOLD=
```

Use `https://api-m.paypal.com` for production PayPal.

`CHECKOUT_DATA_SECRET` is recommended for encrypting checkout customer details at rest. If it is not set, the server falls back to existing private server-side secrets.

For frontend runtime config, copy `js/env.example.js` to `js/env.js`, fill the public Supabase anon settings and WhatsApp number, then include it before page modules if you do not want to edit `js/app-config.js`.

`SHIPPING_COST` and `FREE_SHIPPING_THRESHOLD` are read only by the Cloudflare Functions. The checkout UI may display the expected shipping cost, but the final amount is always recalculated server-side.

## Supabase Setup

1. Create a Supabase project on the free plan.
2. Run `supabase-schema.sql` in the SQL editor.
3. Create your owner account through Supabase Auth.
4. Create `admin@droidunclock.site` in Supabase Auth with a strong password.
5. Run the final `admin_users` insert in `supabase-schema.sql` to authorize that email.
6. Admin is intentionally hidden from navigation: double-click the site logo to open `admin.html`.
7. Add products in `admin.html`.

Re-run `supabase-schema.sql` after pulling security updates. It includes the `stock_reserved_at` order column and the `reserve_order_stock` RPC used to decrement stock atomically after confirmed payment.

## Payment Security

- Stripe and PayPal secret keys are used only inside Cloudflare Pages Functions.
- The frontend never stores card details or gateway secrets.
- Product prices and stock are revalidated server-side before payment sessions are created.
- Stripe payment confirmation should use the `stripe-webhook` function with `STRIPE_WEBHOOK_SECRET`.

## Cloudflare Pages

Build command: none.

Output directory: repository root.

Functions directory: `functions`.

The project is a fast static frontend with Pages Functions for secure payment creation.

To deploy manually from this workspace, set a Cloudflare API token first:

```powershell
Copy-Item .env.example .env
# Edit .env and paste your token into CLOUDFLARE_API_TOKEN
npm run deploy
```

The token must have Cloudflare Pages edit access for the `droidunclocksite` Pages project. Keep the real token in `.env` or your user environment, not in git.
