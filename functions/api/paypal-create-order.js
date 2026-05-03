import {
  assertCheckoutAllowed,
  assertEnv,
  buildValidatedOrder,
  calculateShipping,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  normalizeCustomer,
  orderExpiresAt,
  readJson,
  requireAuthenticatedUser,
} from "./_utils.js";
import { encryptSensitiveData, normalizeSensitiveOrderData } from "./_encryption.js";

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method !== "POST") {
      return json(request, env, 405, { error: "Method not allowed" });
    }

    if (!ensureAllowedOrigin(request, env)) {
      return json(request, env, 403, { error: "Origin not allowed" });
    }

    const missing = assertEnv(env, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SITE_URL",
      "PAYPAL_API_BASE",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
    ]);

    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const supabase = createServiceClient(env);
    const user = await requireAuthenticatedUser(request, supabase);
    if (!user) {
      return json(request, env, 401, { error: "Authentication required." });
    }

    const body = await readJson(request);
    const { customer, missing: missingCustomer } = normalizeCustomer(body);

    if (missingCustomer.length) {
      return json(request, env, 400, { error: "Missing customer fields: " + missingCustomer.join(", ") });
    }

    if (customer.customer_email !== String(user.email || "").trim().toLowerCase()) {
      return json(request, env, 403, { error: "Customer email must match the authenticated account." });
    }

    const checkoutCart = await assertCheckoutAllowed(supabase, user.id, body.cart);
    const orderDraft = await buildValidatedOrder(checkoutCart, supabase);
    const shippingCost = calculateShipping(customer, orderDraft, env);
    const totalAmount = Number((orderDraft.total + shippingCost).toFixed(2));
    const encryptedNotes = await encryptSensitiveData(normalizeSensitiveOrderData(body), env);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          user_id: user.id,
          ...customer,
          total_amount: totalAmount,
          payment_currency: "EUR",
          payment_method: "paypal",
          payment_status: "pending",
          order_status: "Pending",
          encrypted_notes: encryptedNotes,
          expires_at: orderExpiresAt(),
        },
      ])
      .select("id")
      .single();

    if (orderError) {
      return json(request, env, 500, { error: orderError.message });
    }

    const orderItems = orderDraft.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.qty,
      total_price: Number((item.price * item.qty).toFixed(2)),
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return json(request, env, 500, { error: itemsError.message });
    }

    const token = await paypalToken(env);
    const paypalResponse = await fetch(`${env.PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: String(order.id),
            amount: { currency_code: "EUR", value: totalAmount.toFixed(2) },
          },
        ],
        application_context: {
          return_url: `${env.SITE_URL}/success.html?order=${order.id}`,
          cancel_url: `${env.SITE_URL}/cancel.html?order=${order.id}`,
        },
      }),
    });

    const data = await paypalResponse.json().catch(() => ({}));
    if (!paypalResponse.ok) {
      await supabase
        .from("orders")
        .update({ payment_status: "failed", order_status: "Cancelled" })
        .eq("id", order.id);

      return json(request, env, 500, {
        error: data?.message || data?.error_description || "Erro PayPal",
      });
    }

    const { error: paypalIdError } = await supabase.from("orders").update({ paypal_order_id: data.id }).eq("id", order.id);
    if (paypalIdError) {
      return json(request, env, 500, { error: paypalIdError.message });
    }

    const approvalUrl = (data.links || []).find((link) => link.rel === "approve")?.href;
    if (!approvalUrl) {
      await supabase
        .from("orders")
        .update({ payment_status: "failed", order_status: "Cancelled" })
        .eq("id", order.id);

      return json(request, env, 500, { error: "Approval link nao encontrado." });
    }

    return json(request, env, 200, {
      approval_url: approvalUrl,
      paypal_order_id: data.id,
      order_id: order.id,
    });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}

async function paypalToken(env) {
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);

  const response = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error_description || "Erro token PayPal");
  }

  return data.access_token;
}
