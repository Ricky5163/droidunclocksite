import {
  assertEnv,
  buildValidatedOrder,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  normalizeCustomer,
  readJson,
} from "./_utils.js";

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

    const body = await readJson(request);
    const { customer, missing: missingCustomer } = normalizeCustomer(body);

    if (missingCustomer.length) {
      return json(request, env, 400, { error: "Missing customer fields: " + missingCustomer.join(", ") });
    }

    const supabase = createServiceClient(env);
    const orderDraft = await buildValidatedOrder(body.cart, supabase);
    const shippingCost = Math.max(0, Number(body.shipping_cost || 0));
    const totalAmount = Number((orderDraft.total + shippingCost).toFixed(2));

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          ...customer,
          total_amount: totalAmount,
          payment_method: "paypal",
          payment_status: "pending",
          order_status: "Pending",
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
      return json(request, env, 500, {
        error: data?.message || data?.error_description || "Erro PayPal",
      });
    }

    await supabase.from("orders").update({ paypal_order_id: data.id }).eq("id", order.id);

    const approvalUrl = (data.links || []).find((link) => link.rel === "approve")?.href;
    if (!approvalUrl) {
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
