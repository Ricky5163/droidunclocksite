import {
  assertEnv,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  readJson,
  triggerOrderEmails,
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
      "PAYPAL_API_BASE",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "SITE_URL",
      "INTERNAL_API_SECRET",
    ]);

    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const body = await readJson(request);
    const paypalOrderId = String(body.paypalOrderId || "").trim();
    const orderId = String(body.orderId || "").trim();

    if (!paypalOrderId) {
      return json(request, env, 400, { error: "paypalOrderId obrigatorio" });
    }

    const supabase = createServiceClient(env);
    const { data: order, error: orderLookupError } = await supabase
      .from("orders")
      .select("id,status,paypal_order_id")
      .eq("paypal_order_id", paypalOrderId)
      .single();

    if (orderLookupError || !order) {
      return json(request, env, 404, { error: "Encomenda PayPal nao encontrada." });
    }

    if (orderId && String(order.id) !== orderId) {
      return json(request, env, 400, { error: "Order mismatch." });
    }

    if (order.status === "paid") {
      return json(request, env, 200, { ok: true, alreadyPaid: true, orderId: order.id });
    }

    const token = await paypalToken(env);
    const captureResponse = await fetch(
      `${env.PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      }
    );

    const data = await captureResponse.json().catch(() => ({}));
    if (!captureResponse.ok) {
      return json(request, env, 500, {
        error: data?.message || "Erro capture PayPal",
        raw: data,
      });
    }

    await supabase.from("orders").update({ status: "paid" }).eq("id", order.id);
    await triggerOrderEmails(env, order.id);

    return json(request, env, 200, { ok: true, orderId: order.id, data });
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
