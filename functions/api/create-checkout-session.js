import {
  assertEnv,
  calculateShipping,
  cleanEnvValue,
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
      "STRIPE_SECRET_KEY",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SITE_URL",
    ]);

    if (missing.length) {
      return checkoutError(request, env, 500, "missing_env", "Missing server configuration: " + missing.join(", "), {
        stage: "env",
        missing,
      });
    }

    const siteUrl = cleanEnvValue(env.SITE_URL);
    const stripeSecretKey = cleanEnvValue(env.STRIPE_SECRET_KEY);
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
      return checkoutError(request, env, 400, "invalid_customer", "Missing customer fields: " + missingCustomer.join(", "), {
        stage,
        missingCustomer,
      });
    }

    if (customer.customer_email !== String(user.email || "").trim().toLowerCase()) {
      return checkoutError(request, env, 403, "invalid_customer", "Customer email must match the authenticated account.", {
        stage,
      });
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
    let encryptedNotes = null;
    try {
      encryptedNotes = await encryptSensitiveData(normalizeSensitiveOrderData(body), env);
    } catch (error) {
      return checkoutError(request, env, 500, "server_config_error", readableError(error, "Erro na configuracao de encriptacao."), {
        stage: "encrypt_notes",
      });
    }

    stage = "create_order";
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          user_id: user.id,
          ...customer,
          total_amount: totalAmount,
          payment_currency: "EUR",
          payment_method: "stripe",
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

    stage = "stripe_create_session";
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("customer_email", customer.customer_email);
    form.set("client_reference_id", String(order.id));
    form.set("success_url", `${siteUrl}/success.html?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${siteUrl}/cancel.html?order=${order.id}`);
    form.append("payment_method_types[]", "card");
    form.set("metadata[order_id]", String(order.id));

    const stripeItems = [...orderDraft.items];
    if (shippingCost > 0) {
      stripeItems.push({ name: "Shipping", price: shippingCost, qty: 1 });
    }

    stripeItems.forEach((item, index) => {
      form.set(`line_items[${index}][quantity]`, String(item.qty));
      form.set(`line_items[${index}][price_data][currency]`, "eur");
      form.set(
        `line_items[${index}][price_data][unit_amount]`,
        String(Math.round(item.price * 100))
      );
      form.set(`line_items[${index}][price_data][product_data][name]`, item.name || "Produto");
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const session = await stripeResponse.json().catch(() => ({}));
    console.log("[checkout backend]", {
      provider: "stripe",
      stage,
      status: stripeResponse.status,
      ok: stripeResponse.ok,
      hasRedirectUrl: Boolean(session?.url),
      orderId: order.id,
      totalAmount,
      currency: "eur",
      itemCount: orderDraft.items.length,
      stripeKeyLooksValid: /^sk_(test|live)_/.test(stripeSecretKey),
    });

    if (!stripeResponse.ok || !session.url) {
      await supabase
        .from("orders")
        .update({ payment_status: "failed", order_status: "Cancelled" })
        .eq("id", order.id);

      return checkoutError(request, env, 500, "stripe_error", session?.error?.message || "Erro ao criar sessao Stripe.", {
        stage,
        stripeStatus: stripeResponse.status,
        stripeType: session?.error?.type || null,
        stripeCode: session?.error?.code || null,
        orderId: order.id,
      });
    }

    return json(request, env, 200, { url: session.url, sessionUrl: session.url });
  } catch (error) {
    const message = error?.message || String(error || "") || `Erro no checkout Stripe (${stage}).`;
    const code = classifyCheckoutFailure(error, stage);
    return checkoutError(request, env, 500, code, message, { stage });
  }
}

function checkoutError(request, env, status, code, message, details = {}) {
  console.warn("[checkout backend]", {
    provider: "stripe",
    stage: details.stage || null,
    code,
    status,
    errorMessage: message,
    missing: details.missing || undefined,
    missingCustomer: details.missingCustomer || undefined,
    dbCode: details.dbCode || undefined,
    stripeStatus: details.stripeStatus || undefined,
    stripeType: details.stripeType || undefined,
    stripeCode: details.stripeCode || undefined,
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
  if (stage === "validate_cart" && (message.includes("stock") || message.includes("indisponive"))) return "invalid_stock";
  if (stage === "validate_cart" || message.includes("carrinho") || message.includes("produto") || message.includes("preco")) return "invalid_cart";
  if (stage?.includes("stripe")) return "stripe_error";
  if (stage?.includes("order") || message.includes("column") || message.includes("constraint") || message.includes("policy")) return "database_error";
  if (message.includes("rpc")) return "rpc_error";
  return "internal_error";
}
