# Security Checkout Test Plan

## Scope

Validate the security and consistency changes around checkout, payment confirmation, stock reservation, PayPal capture authorization, pending checkout abuse protection, and order expiration.

## 1. Preparation

- Use a Supabase staging project when possible.
- Run the updated `supabase-schema.sql` in the Supabase SQL Editor or migration runner.
- Confirm the `orders` table has:
  - `user_id`
  - `payment_currency`
  - `encrypted_notes`
  - `expires_at`
- Confirm the RPC exists:
  - `public.mark_order_paid_after_stock(uuid, text)`
- Confirm RPC permissions:
  - `anon` cannot execute it.
  - `authenticated` cannot execute it.
  - `service_role` can execute it.

## 2. RPC With Sufficient Stock

- Create an active product with `stock = 5`.
- Create a `pending` order with a valid `user_id`.
- Create `order_items` for that order with `quantity = 2`.
- Execute `mark_order_paid_after_stock` using `service_role`.

Expected:
- Product stock becomes `3`.
- Order has `payment_status = 'paid'`.
- Order has `order_status = 'Paid'`.
- `stock_reserved_at` is populated.
- RPC returns `ok: true` and `changed: true`.

## 3. RPC Idempotency

- Execute the same RPC again for the same order.

Expected:
- Product stock stays `3`.
- Stock is not decremented again.
- `stock_reserved_at` remains valid.
- RPC returns `ok: true` and `changed: false`.

## 4. Insufficient Stock

- Create an active product with `stock = 1`.
- Create a `pending` order.
- Create `order_items` with `quantity = 2`.
- Execute `mark_order_paid_after_stock`.

Expected:
- Product stock stays `1`.
- Order does not become `paid`.
- Order has `payment_status = 'payment_confirmed_stock_failed'`.
- `stock_reserved_at` remains `null`.
- RPC returns `ok: false` with a clear stock error.

## 5. No Negative Stock

- Repeat the insufficient stock test multiple times.

Expected:
- Product stock never goes below zero.
- No partial decrement occurs.

## 6. Repeated Stripe Webhook

- Simulate a valid `checkout.session.completed` webhook once.
- Simulate the same webhook again.

Expected:
- First webhook reserves stock and marks the order as paid.
- Second webhook does not decrement stock again.
- Emails are not duplicated when the RPC returns `changed: false`.
- Order remains consistent.

## 7. PayPal Capture Without Token

- Call `/api/paypal-capture-order` without an `Authorization` header.
- Body:

```json
{
  "paypalOrderId": "PAYPAL_ORDER_ID",
  "orderId": "ORDER_ID"
}
```

Expected:
- HTTP `401`.
- Response contains `Authentication required.`
- Order is not changed.
- Stock is not changed.

## 8. PayPal Capture With Owner Token

- Create a PayPal order with `payment_status = 'pending'` and `user_id` for user A.
- Call `/api/paypal-capture-order` with user A's Bearer token.
- Use the correct `paypalOrderId` and `orderId`.

Expected:
- Capture is accepted.
- If PayPal returns `COMPLETED`, the RPC runs.
- Order becomes `paid` when stock is available.
- Response only includes:

```json
{
  "ok": true,
  "orderId": "...",
  "paymentStatus": "paid"
}
```

- No raw PayPal payload is returned.

## 9. PayPal Capture With Wrong User

- Create a PayPal order with `payment_status = 'pending'` and `user_id` for user A.
- Call `/api/paypal-capture-order` with user B's Bearer token.

Expected:
- HTTP `403`.
- Response states that the order does not belong to the authenticated user.
- Order remains `pending`.
- Stock does not change.

## 10. PayPal Capture For Non-Pending Order

- Use an order with one of these statuses:
  - `paid`
  - `failed`
  - `cancelled`
  - `payment_confirmed_stock_failed`
- Call `/api/paypal-capture-order` with the owner's Bearer token.

Expected:
- HTTP `409`.
- Response includes `paymentStatus`.
- Capture is not attempted again.
- Stock does not change.

## 11. `orders.expires_at`

- Create a Stripe checkout.
- Create a PayPal checkout.
- Inspect both created orders.

Expected:
- `expires_at` is populated.
- `expires_at` is approximately `created_at + 30 minutes`.
- Order remains `pending` until the payment provider confirms or fails.

## 12. Pending Checkout Anti-Abuse

- With the same user, create 3 pending checkouts within 15 minutes.
- Attempt to create a 4th checkout.

Expected:
- The 4th attempt is rejected.
- Error message indicates too many recent checkout attempts.
- No new order is created for the 4th attempt.

Then:
- Use pending checkouts outside the 15-minute window.

Expected:
- New checkout is allowed again.

## 13. Empty Cart

- Call Stripe checkout creation with `cart: []`.
- Call PayPal checkout creation with `cart: []`.

Expected:
- Request is rejected with `Carrinho invalido.`
- No order is created.

## 14. Maximum Quantity Per Order

- Call Stripe or PayPal checkout creation with total item quantity above `20`.

Expected:
- Request is rejected with a clear maximum quantity error.
- No order is created.

## 15. Final Supabase Verification

- Check all test products:
  - Stock is correct.
  - Stock is never negative.
- Check all test orders:
  - Statuses are coherent.
  - `stock_reserved_at` is only populated when stock was reserved.
  - `payment_confirmed_stock_failed` is visible for stock failures after payment confirmation.
- Check frontend/API responses:
  - No raw PayPal payload is returned.
  - No unnecessary personal data is exposed.
  - No sensitive payment data is stored.
