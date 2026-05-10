import { createClient } from "@supabase/supabase-js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_PENDING_LIMIT = 3;
const CHECKOUT_PENDING_WINDOW_MINUTES = 15;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ORDER_EXPIRY_MINUTES = 30;
export const MAX_CHECKOUT_ITEMS = 20;

class CheckoutValidationError extends Error {
  constructor(message, code = "invalid_cart", status = 400, context = {}) {
    super(message);
    this.name = "CheckoutValidationError";
    this.code = code;
    this.status = status;
    this.context = context;
  }
}

export function createServiceClient(env) {
  return createClient(cleanEnvValue(env.SUPABASE_URL), cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY));
}

export function createAuthClient(env) {
  return createClient(cleanEnvValue(env.SUPABASE_URL), cleanEnvValue(env.SUPABASE_ANON_KEY), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function cleanEnvValue(value) {
  return String(value || "").trim();
}

export function assertEnv(env, names) {
  return names.filter((name) => !cleanEnvValue(env[name]));
}

export function formatSupabaseError(error) {
  if (!error) return "Supabase error.";

  const props = Object.fromEntries(
    Object.getOwnPropertyNames(error)
      .map((key) => [key, error[key]])
      .filter(([, value]) => value)
  );
  const serialized = safeJson(error);
  const hasUsefulSerializedValue = serialized && serialized !== "{}" && serialized !== '{"message":""}';

  return [
    error.message || props.message,
    error.details || props.details,
    error.hint || props.hint,
    error.code || props.code ? `code=${error.code || props.code}` : "",
    hasUsefulSerializedValue ? serialized : "",
  ]
    .filter(Boolean)
    .join(" | ") || "Supabase query failed without details.";
}

export function isCheckoutValidationError(error) {
  return error?.name === "CheckoutValidationError";
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function logSupabaseError(stage, error, context = {}) {
  console.warn("[supabase debug]", {
    stage,
    message: error?.message || null,
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null,
    productIds: context.productIds || undefined,
    cartItemCount: context.cartItemCount,
    queryVariant: context.queryVariant || undefined,
    columns: context.columns || undefined,
    status: context.status || undefined,
    responseBody: context.responseBody || undefined,
  });
}

function logCheckoutCart(stage, context = {}) {
  console.warn("[checkout cart]", {
    stage,
    rawCart: context.rawCart,
    productIds: context.productIds || undefined,
    foundProductIds: context.foundProductIds || undefined,
    missingIds: context.missingIds || undefined,
    inactiveProductIds: context.inactiveProductIds || undefined,
    futureProductIds: context.futureProductIds || undefined,
    outOfStockProductIds: context.outOfStockProductIds || undefined,
    invalidItemCount: context.invalidItemCount,
    cartItemCount: context.cartItemCount,
    requestedQty: context.requestedQty,
    stock: context.stock,
    columns: context.columns || undefined,
  });
}

export function json(request, env, status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

export function corsHeaders(request, env) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Internal-Auth",
    Vary: "Origin",
  };

  const origin = request.headers.get("origin");
  const allowedOrigin = resolveAllowedOrigin(origin, env);

  if (allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;

  return headers;
}

export function handleOptions(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function ensureAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  return Boolean(resolveAllowedOrigin(origin, env));
}

export function resolveAllowedOrigin(origin, env) {
  if (!origin) return null;

  const siteOrigin = normalizeOrigin(env.SITE_URL);
  if (siteOrigin && origin === siteOrigin) return origin;

  const localhost = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8788",
    "http://127.0.0.1:8788",
  ];

  if (localhost.includes(origin)) return origin;
  return null;
}

export function normalizeEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  return EMAIL_REGEX.test(clean) ? clean : null;
}

export function normalizeCustomer(body = {}) {
  const customer = {
    customer_name: String(body.customer_name || body.name || "").trim(),
    customer_email: normalizeEmail(body.customer_email || body.email),
    customer_phone: String(body.customer_phone || body.phone || "").trim(),
    country: String(body.country || "").trim(),
    address: String(body.address || "").trim(),
    postal_code: String(body.postal_code || body.postalCode || "").trim(),
    city: String(body.city || "").trim(),
  };

  const missing = Object.entries(customer)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return { customer, missing };
}

export async function requireAdminAuth(request, env, supabase = createServiceClient(env)) {
  const authorization = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = normalizeEmail(userData?.user?.email);
  const userId = userData?.user?.id;
  if (userError || !email || !userId) return null;

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("id,user_id,email,role")
    .eq("user_id", userId)
    .maybeSingle();

  return adminError || !admin ? null : { ...admin, user: userData.user };
}

export async function requireAuthenticatedUser(request, supabase, env = {}) {
  const authorization = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const hasAuthHeader = Boolean(authorization);
  const hasBearer = /^Bearer\s+/i.test(authorization);
  const token = hasBearer ? authorization.replace(/^Bearer\s+/i, "").trim() : "";

  if (!token) {
    logAuthDebug(env, { hasAuthHeader, hasBearer, tokenLength: 0, getUserErrorMessage: null });
    return null;
  }

  let data;
  let error;
  try {
    const result = await supabase.auth.getUser(token);
    data = result.data;
    error = result.error;
  } catch (authError) {
    logAuthDebug(env, {
      hasAuthHeader,
      hasBearer,
      tokenLength: token.length,
      getUserErrorMessage: authError?.message || "Auth request failed",
    });
    return null;
  }

  if (error || !data?.user) {
    logAuthDebug(env, {
      hasAuthHeader,
      hasBearer,
      tokenLength: token.length,
      getUserErrorMessage: error?.message || "No user returned",
    });
    return null;
  }

  return data.user;
}

function logAuthDebug(env, details) {
  console.warn("[auth debug]", {
    hasAuthHeader: Boolean(details.hasAuthHeader),
    hasBearer: Boolean(details.hasBearer),
    tokenLength: Number(details.tokenLength || 0),
    hasSupabaseUrl: Boolean(cleanEnvValue(env.SUPABASE_URL)),
    hasAnonKey: Boolean(cleanEnvValue(env.SUPABASE_ANON_KEY)),
    getUserErrorMessage: details.getUserErrorMessage || null,
  });
}

export async function readJson(request) {
  return request.json().catch(() => ({}));
}

export function normalizeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function requireInternalAuth(request, env) {
  const secret = env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return request.headers.get("X-Internal-Auth") === secret;
}

export function normalizeCart(cart) {
  return parseCheckoutCart(cart).items;
}

export async function validateCheckoutCart(supabase, userId, cart, env) {
  const parsedCart = parseCheckoutCart(cart);
  const normalizedCart = parsedCart.items;

  if (!normalizedCart.length) {
    logCheckoutCart("normalize_cart", {
      rawCart: sanitizeCartForLog(cart),
      productIds: [],
      invalidItemCount: parsedCart.invalidItems.length || (Array.isArray(cart) ? cart.length : 0),
    });
    throw new CheckoutValidationError("Carrinho vazio ou invalido.", "invalid_cart", 400);
  }

  if (parsedCart.invalidItems.length) {
    logCheckoutCart("normalize_cart", {
      rawCart: sanitizeCartForLog(cart),
      productIds: normalizedCart.map((item) => item.id),
      invalidItemCount: parsedCart.invalidItems.length,
    });
    throw new CheckoutValidationError("Invalid quantity.", "invalid_cart", 400);
  }

  const itemCount = normalizedCart.reduce((sum, item) => sum + item.qty, 0);
  if (itemCount > MAX_CHECKOUT_ITEMS) {
    throw new CheckoutValidationError(`O pedido nao pode ter mais de ${MAX_CHECKOUT_ITEMS} itens.`, "invalid_cart", 400);
  }

  await assertCheckoutPendingLimit(userId, normalizedCart, env);
  return buildValidatedOrder(normalizedCart, supabase, env);
}

export async function assertCheckoutAllowed(supabase, userId, cart, env) {
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length) {
    logCheckoutCart("normalize_cart", {
      rawCart: sanitizeCartForLog(cart),
      productIds: [],
      invalidItemCount: Array.isArray(cart) ? cart.length : 0,
    });
    throw new CheckoutValidationError("Carrinho vazio ou invalido.", "invalid_cart", 400);
  }

  await assertCheckoutPendingLimit(userId, normalizedCart, env);
  return normalizedCart;
}

async function assertCheckoutPendingLimit(userId, normalizedCart, env) {
  const windowStart = new Date(Date.now() - CHECKOUT_PENDING_WINDOW_MINUTES * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "id",
    user_id: `eq.${userId}`,
    payment_status: "eq.pending",
    created_at: `gte.${windowStart}`,
  });

  const { data, error } = await supabaseRestGet(env, "orders", params, {
    stage: "checkout_pending_count",
    cartItemCount: normalizedCart.length,
  });

  if (error) {
    throw new CheckoutValidationError(error.message, "database_error", 500);
  }

  const count = Array.isArray(data) ? data.length : 0;
  if (count >= CHECKOUT_PENDING_LIMIT) {
    throw new CheckoutValidationError("Demasiadas tentativas de checkout recentes. Aguarda alguns minutos e tenta novamente.", "invalid_cart", 429);
  }
}

export function orderExpiresAt() {
  return new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

export async function buildValidatedOrder(cart, supabase, env) {
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length) {
    logCheckoutCart("normalize_cart", {
      rawCart: sanitizeCartForLog(cart),
      productIds: [],
      invalidItemCount: Array.isArray(cart) ? cart.length : 0,
    });
    throw new CheckoutValidationError("Carrinho vazio ou invalido.", "invalid_cart", 400);
  }

  const ids = normalizedCart.map((item) => item.id);
  const products = await fetchCheckoutProducts(env, ids);

  const productMap = new Map(
    (products || [])
      .map((product) => [String(product.id), product])
  );

  const missingIds = ids.filter((id) => !productMap.has(id));
  if (missingIds.length) {
    logCheckoutCart("product_availability", {
      productIds: ids,
      foundProductIds: [...productMap.keys()],
      missingIds,
    });
    throw new CheckoutValidationError("Product not found.", "invalid_cart", 404);
  }

  let total = 0;
  const items = normalizedCart.map((item) => {
    const product = productMap.get(item.id);
    const basePrice = getProductPrice(product);
    const discountPrice = Number(product.discount_price || 0);
    const price = discountPrice > 0 && discountPrice < basePrice ? discountPrice : basePrice;
    const stock = Number(product.stock ?? 0);

    if (product.active === false) {
      logCheckoutCart("product_availability", {
        productIds: ids,
        inactiveProductIds: [item.id],
      });
      throw new CheckoutValidationError("Product unavailable.", "invalid_cart", 409);
    }

    if (product.publish_at && new Date(product.publish_at) > new Date()) {
      logCheckoutCart("product_availability", {
        productIds: ids,
        futureProductIds: [item.id],
      });
      throw new CheckoutValidationError("Product not yet available.", "invalid_cart", 409);
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new CheckoutValidationError(`Preco invalido para ${product.name || "produto"}.`, "invalid_cart", 400);
    }

    if (!Number.isFinite(stock) || stock <= 0 || stock < item.qty) {
      logCheckoutCart("product_availability", {
        productIds: ids,
        outOfStockProductIds: [item.id],
        requestedQty: item.qty,
        stock: Number.isFinite(stock) ? stock : null,
      });
      throw new CheckoutValidationError("Not enough stock.", "invalid_stock", 409);
    }

    total += price * item.qty;

    return {
      product_id: product.id,
      name: product.name,
      price,
      qty: item.qty,
    };
  });

  return {
    items,
    total: Number(total.toFixed(2)),
  };
}

async function fetchCheckoutProducts(env, ids) {
  const variants = [
    {
      name: "publish_discount",
      columns: "id,name,price,discount_price,stock,active,publish_at",
      publishFilter: true,
    },
    {
      name: "discount",
      columns: "id,name,price,discount_price,stock,active",
      publishFilter: false,
    },
    {
      name: "publish_basic",
      columns: "id,name,price,stock,active,publish_at",
      publishFilter: true,
    },
    {
      name: "basic",
      columns: "id,name,price,stock,active",
      publishFilter: false,
    },
    {
      name: "price_cents_publish",
      columns: "id,name,price_cents,stock,active,publish_at",
      publishFilter: true,
    },
    {
      name: "price_cents",
      columns: "id,name,price_cents,stock,active",
      publishFilter: false,
    },
  ];

  let lastError = null;
  for (const variant of variants) {
    const params = new URLSearchParams({
      select: variant.columns,
      id: `in.(${ids.join(",")})`,
    });
    const { data, error } = await supabaseRestGet(env, "products", params, {
      stage: "checkout_products_query",
      productIds: ids,
      cartItemCount: ids.length,
      queryVariant: variant.name,
      columns: variant.columns,
    });

    if (!error) {
      console.log("[checkout products]", {
        queryVariant: variant.name,
        columns: variant.columns,
        productIds: ids,
        foundProductIds: (data || []).map((product) => String(product.id)),
        inactiveProductIds: (data || []).filter((product) => product.active === false).map((product) => String(product.id)),
        outOfStockProductIds: (data || [])
          .filter((product) => !Number.isFinite(Number(product.stock ?? 0)) || Number(product.stock ?? 0) <= 0)
          .map((product) => String(product.id)),
        foundCount: data?.length || 0,
      });
      return data || [];
    }

    lastError = error;
    if (!isMissingOptionalProductColumn(error)) break;
  }

  throw new CheckoutValidationError(formatSupabaseError(lastError), "database_error", 500);
}

async function supabaseRestGet(env, table, params, context = {}) {
  const baseUrl = cleanEnvValue(env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
  const url = `${baseUrl}/rest/v1/${table}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });
    const bodyText = await response.text();
    const data = bodyText ? JSON.parse(bodyText) : [];

    if (!response.ok) {
      const error = normalizeRestError(data, response.status);
      logSupabaseError(context.stage || `rest_${table}`, error, {
        ...context,
        status: response.status,
        responseBody: sanitizeSupabaseResponseBody(data),
      });
      return { data: null, error };
    }

    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (error) {
    const normalized = normalizeRestError(error, null);
    logSupabaseError(context.stage || `rest_${table}`, normalized, context);
    return { data: null, error: normalized };
  }
}

function normalizeRestError(error, status) {
  if (error && typeof error === "object") {
    return {
      message: error.message || (status ? `Supabase REST error ${status}` : "Supabase REST request failed"),
      code: error.code || null,
      details: error.details || null,
      hint: error.hint || null,
      status,
    };
  }

  return {
    message: String(error || "") || (status ? `Supabase REST error ${status}` : "Supabase REST request failed"),
    code: null,
    details: null,
    hint: null,
    status,
  };
}

function sanitizeSupabaseResponseBody(body) {
  if (!body || typeof body !== "object") return body || null;
  return {
    message: body.message || null,
    code: body.code || null,
    details: body.details || null,
    hint: body.hint || null,
  };
}

function getProductPrice(product) {
  if (product?.price !== undefined && product?.price !== null) {
    return Number(product.price || 0);
  }

  if (product?.price_cents !== undefined && product?.price_cents !== null) {
    return Number(product.price_cents || 0) / 100;
  }

  return 0;
}

function sanitizeCartForLog(cart) {
  if (!Array.isArray(cart)) return [];
  return cart.map((item) => ({
    id: String(item?.id || "").trim() || undefined,
    product_id: String(item?.product_id || "").trim() || undefined,
    productId: String(item?.productId || "").trim() || undefined,
    qty: Number(item?.qty || 1),
  }));
}

function parseCheckoutCart(cart) {
  if (!Array.isArray(cart)) return { items: [], invalidItems: [] };

  const quantities = new Map();
  const invalidItems = [];

  for (const entry of cart) {
    const id = String(entry?.id || entry?.product_id || entry?.productId || "").trim();
    const rawQty = entry?.qty ?? entry?.quantity;
    const qty = Number(rawQty);

    if (!id || !UUID_REGEX.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
      invalidItems.push({ id, qty: rawQty });
      continue;
    }

    quantities.set(id, (quantities.get(id) || 0) + qty);
  }

  return {
    items: [...quantities.entries()].map(([id, qty]) => ({ id, qty: Math.min(qty, 20) })),
    invalidItems,
  };
}

function isMissingOptionalProductColumn(error) {
  const message = [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return message.includes("publish_at") || message.includes("discount_price") || message.includes("price") || message.includes("schema cache");
}

export function calculateShipping(customer, orderDraft, env) {
  const baseShipping = numericEnv(env.SHIPPING_COST, 6.95);
  const freeShippingThreshold = numericEnv(env.FREE_SHIPPING_THRESHOLD, 0);
  const subtotal = Number(orderDraft?.total || 0);

  if (freeShippingThreshold > 0 && subtotal >= freeShippingThreshold) return 0;
  if (!orderDraft?.items?.length) return 0;

  return Number(baseShipping.toFixed(2));
}

function numericEnv(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export async function markOrderPaid(supabase, orderId, updates = {}) {
  const { data, error } = await supabase.rpc("mark_order_paid_after_stock", {
    p_order_id: orderId,
    p_stripe_payment_intent_id: updates.stripe_payment_intent_id ?? null,
  });

  if (error) throw new Error(formatSupabaseError(error));
  if (!data?.ok) {
    throw new Error(data?.error || "Pagamento confirmado, mas nao foi possivel reservar stock.");
  }

  return {
    order: {
      id: orderId,
      payment_status: data.payment_status,
      order_status: data.order_status,
    },
    changed: Boolean(data.changed),
  };
}

export async function reserveOrderStock(supabase, orderId) {
  const { error } = await supabase.rpc("reserve_order_stock", { p_order_id: orderId });
  if (error) throw new Error(formatSupabaseError(error));
}

export async function triggerOrderEmails(env, orderId) {
  if (!env.INTERNAL_API_SECRET) return;

  const response = await fetch(`${env.SITE_URL}/api/send-order-emails`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Auth": env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify({ orderId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    console.warn("[order email]", {
      orderId,
      status: response.status,
      errorMessage: data?.error || "Email endpoint failed.",
    });
  }
}
