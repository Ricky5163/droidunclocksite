import {
  assertEnv,
  createAuthClient,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  readJson,
  markOrderPaid,
  requireAuthenticatedUser,
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
      "SUPABASE_ANON_KEY",
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
    const authClient = createAuthClient(env);
    const user = await requireAuthenticatedUser(request, authClient);
    if (!user) {
      return json(request, env, 401, { error: "Authentication required." });
    }

    const { data: order, error: orderLookupError } = await supabase
      .from("orders")
      .select("id,user_id,payment_status,paypal_order_id,total_amount")
      .eq("paypal_order_id", paypalOrderId)
      .single();

    if (orderLookupError || !order) {
      return json(request, env, 404, { error: "Encomenda PayPal nao encontrada." });
    }

    if (orderId && String(order.id) !== orderId) {
      return json(request, env, 400, { error: "Order mismatch." });
    }

    if (String(order.user_id || "") !== String(user.id || "")) {
      return json(request, env, 403, { error: "Order does not belong to the authenticated user." });
    }

    if (order.payment_status !== "pending") {
      return json(request, env, 409, {
        error: "Order is not pending payment.",
        orderId: order.id,
        paymentStatus: order.payment_status,
      });
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
      });
    }

    const validationError = validatePayPalCapture(data, order);
    if (validationError) {
      return json(request, env, 409, { error: validationError });
    }

    let result;
    try {
      result = await markOrderPaid(supabase, order.id);
    } catch (error) {
      return json(request, env, 409, {
        error: error?.message || "Pagamento confirmado, mas nao foi possivel reservar stock.",
        orderId: order.id,
        paymentStatus: "payment_confirmed_stock_failed",
      });
    }

    if (result.changed) {
      await triggerOrderEmails(env, order.id);
    }

    return json(request, env, 200, {
      ok: true,
      orderId: order.id,
      paymentStatus: result.order.payment_status,
    });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}

function validatePayPalCapture(data, order) {
  if (data?.status !== "COMPLETED") {
    return "PayPal payment was not completed.";
  }

  const purchaseUnit = (data.purchase_units || []).find(
    (unit) => String(unit.reference_id || "") === String(order.id)
  );

  if (!purchaseUnit) {
    return "PayPal order reference mismatch.";
  }

  const capture = (purchaseUnit.payments?.captures || []).find((entry) => entry.status === "COMPLETED");
  if (!capture) {
    return "PayPal capture was not completed.";
  }

  const currency = capture.amount?.currency_code;
  const value = Number(capture.amount?.value);
  const expected = Number(order.total_amount || 0);

  if (currency !== "EUR") {
    return "PayPal capture currency mismatch.";
  }

  if (!Number.isFinite(value) || Math.abs(value - expected) > 0.01) {
    return "PayPal capture amount mismatch.";
  }

  return "";
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
