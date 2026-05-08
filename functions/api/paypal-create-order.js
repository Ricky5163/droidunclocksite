import {
  assertEnv,
  calculateShipping,
  createAuthClient,
  createServiceClient,
  ensureAllowedOrigin,
  formatSupabaseError,
  handleOptions,
  isCheckoutValidationError,
  json,
  normalizeCustomer,
  orderExpiresAt,
  readJson,
  requireAuthenticatedUser,
  validateCheckoutCart,
} from "./_utils.js";
import { encryptSensitiveData, normalizeSensitiveOrderData } from "./_encryption.js";

export async function onRequest(context) {
  const { request, env } = context;
  let stage = "start";

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
      "SITE_URL",
      "PAYPAL_API_BASE",
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
    ]);

    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const supabase = createServiceClient(env);
    const authClient = createAuthClient(env);
    stage = "auth";
    const user = await requireAuthenticatedUser(request, authClient, env);
    if (!user) {
      return json(request, env, 401, { error: "Authentication required." });
    }

    stage = "read_body";
    const body = await readJson(request);
    const { customer, missing: missingCustomer } = normalizeCustomer(body);

    if (missingCustomer.length) {
      return json(request, env, 400, { error: "Missing customer fields: " + missingCustomer.join(", ") });
    }

    if (customer.customer_email !== String(user.email || "").trim().toLowerCase()) {
      return json(request, env, 403, { error: "Customer email must match the authenticated account." });
    }

    stage = "validate_cart";
    let orderDraft;
    try {
      orderDraft = await validateCheckoutCart(supabase, user.id, body.cart, env);
    } catch (error) {
      const code = isCheckoutValidationError(error) ? error.code : classifyCheckoutFailure(error, stage);
      const status = isCheckoutValidationError(error) ? error.status : code === "invalid_stock" ? 409 : 400;
      return checkoutError(request, env, status, code, readableError(error, "Carrinho invalido."), {
        stage,
        cartItemCount: Array.isArray(body.cart) ? body.cart.length : 0,
      });
    }

    const shippingCost = calculateShipping(customer, orderDraft, env);
    const totalAmount = Number((orderDraft.total + shippingCost).toFixed(2));
    const encryptedNotes = await encryptSensitiveData(normalizeSensitiveOrderData(body), env);

    stage = "create_order";
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
      return checkoutError(request, env, 500, "database_error", formatSupabaseError(orderError), {
        stage,
        dbCode: orderError.code || null,
      });
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
      return checkoutError(request, env, 500, "database_error", formatSupabaseError(itemsError), {
        stage: "create_order_items",
        dbCode: itemsError.code || null,
        orderId: order.id,
      });
    }

    stage = "paypal_token";
    const token = await paypalToken(env);
    stage = "paypal_create_order";
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
    const approvalUrl = (data.links || []).find((link) => link.rel === "approve")?.href;
    console.log("[checkout backend]", {
      provider: "paypal",
      stage,
      status: paypalResponse.status,
      ok: paypalResponse.ok,
      hasApprovalUrl: Boolean(approvalUrl),
      orderId: order.id,
      totalAmount,
      currency: "EUR",
      itemCount: orderDraft.items.length,
    });

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
      console.warn("[checkout backend]", { provider: "paypal", stage: "save_paypal_order_id", errorMessage: paypalIdError.message });
      return json(request, env, 500, { error: paypalIdError.message });
    }

    if (!approvalUrl) {
      await supabase
        .from("orders")
        .update({ payment_status: "failed", order_status: "Cancelled" })
        .eq("id", order.id);

      return json(request, env, 500, { error: "Approval link nao encontrado." });
    }

    return json(request, env, 200, {
      approval_url: approvalUrl,
      approvalUrl,
      paypal_order_id: data.id,
      orderID: data.id,
      order_id: order.id,
    });
  } catch (error) {
    const message = error?.message || String(error || "") || `Erro no checkout PayPal (${stage}).`;
    const code = classifyCheckoutFailure(error, stage);
    return checkoutError(request, env, 500, code, message, { stage });
  }
}

function checkoutError(request, env, status, code, message, details = {}) {
  console.warn("[checkout backend]", {
    provider: "paypal",
    stage: details.stage || null,
    code,
    status,
    errorMessage: message,
    dbCode: details.dbCode || undefined,
    cartItemCount: details.cartItemCount,
    orderId: details.orderId,
  });

  return json(request, env, status, { ok: false, code, error: message });
}

function readableError(error, fallback) {
  return error?.message || String(error || "") || fallback;
}

function classifyCheckoutFailure(error, stage) {
  const message = readableError(error, "").toLowerCase();
  if (stage === "validate_cart" && (message.includes("stock") || message.includes("not enough"))) return "invalid_stock";
  if (stage === "validate_cart" || message.includes("carrinho") || message.includes("product") || message.includes("preco")) return "invalid_cart";
  if (stage?.includes("paypal")) return "paypal_error";
  if (stage?.includes("order") || message.includes("column") || message.includes("constraint") || message.includes("policy")) return "database_error";
  if (message.includes("rpc")) return "rpc_error";
  return "internal_error";
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
    throw new Error(data?.error_description || data?.error || "Erro token PayPal");
  }

  return data.access_token;
}
