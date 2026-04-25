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
```

Use `https://api-m.paypal.com` for production PayPal.

For frontend runtime config, copy `js/env.example.js` to `js/env.js`, fill the public Supabase anon settings and WhatsApp number, then include it before page modules if you do not want to edit `js/app-config.js`.

## Supabase Setup

1. Create a Supabase project on the free plan.
2. Run `supabase-schema.sql` in the SQL editor.
3. Create your owner account through Supabase Auth.
4. Create `admin@droidunclock.site` in Supabase Auth with a strong password.
5. Run the final `admin_users` insert in `supabase-schema.sql` to authorize that email.
6. Admin is intentionally hidden from navigation: double-click the site logo to open `admin.html`.
7. Add products in `admin.html`.

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
