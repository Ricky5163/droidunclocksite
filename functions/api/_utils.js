import { createClient } from "@supabase/supabase-js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_PENDING_LIMIT = 3;
const CHECKOUT_PENDING_WINDOW_MINUTES = 15;
export const ORDER_EXPIRY_MINUTES = 30;
export const MAX_CHECKOUT_ITEMS = 20;

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
  return [
    error.message,
    error.details,
    error.hint,
    error.code ? `code=${error.code}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || "Supabase error.";
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
  if (!Array.isArray(cart)) return [];

  const quantities = new Map();

  for (const entry of cart) {
    const id = String(entry?.id || "").trim();
    const qty = Math.max(1, Math.min(20, Number(entry?.qty || 1)));
    if (!id) continue;

    quantities.set(id, Math.min((quantities.get(id) || 0) + qty, 20));
  }

  return [...quantities.entries()].map(([id, qty]) => ({ id, qty }));
}

export async function assertCheckoutAllowed(supabase, userId, cart) {
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length) {
    throw new Error("Carrinho invalido.");
  }

  const itemCount = normalizedCart.reduce((sum, item) => sum + item.qty, 0);
  if (itemCount > MAX_CHECKOUT_ITEMS) {
    throw new Error(`O pedido nao pode ter mais de ${MAX_CHECKOUT_ITEMS} itens.`);
  }

  const windowStart = new Date(Date.now() - CHECKOUT_PENDING_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("payment_status", "pending")
    .gte("created_at", windowStart);

  if (error) throw new Error(formatSupabaseError(error));
  if (Number(count || 0) >= CHECKOUT_PENDING_LIMIT) {
    throw new Error("Demasiadas tentativas de checkout recentes. Aguarda alguns minutos e tenta novamente.");
  }

  return normalizedCart;
}

export function orderExpiresAt() {
  return new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000).toISOString();
}

export async function buildValidatedOrder(cart, supabase) {
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length) {
    throw new Error("Carrinho invalido.");
  }

  const ids = normalizedCart.map((item) => item.id);
  const { data: products, error } = await supabase
    .from("products")
    .select("id,name,price,discount_price,stock,active,publish_at")
    .in("id", ids)
    .eq("active", true)
    .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`);

  if (error) throw new Error(formatSupabaseError(error));

  const productMap = new Map(
    (products || [])
      .map((product) => [String(product.id), product])
  );

  if (productMap.size !== normalizedCart.length) {
    throw new Error("Existem produtos invalidos ou indisponiveis.");
  }

  let total = 0;
  const items = normalizedCart.map((item) => {
    const product = productMap.get(item.id);
    const basePrice = Number(product.price || 0);
    const discountPrice = Number(product.discount_price || 0);
    const price = discountPrice > 0 && discountPrice < basePrice ? discountPrice : basePrice;
    const stock = Number(product.stock ?? 0);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Preco invalido para ${product.name || "produto"}.`);
    }

    if (Number.isFinite(stock) && stock < item.qty) {
      throw new Error(`Stock insuficiente para ${product.name || "produto"}.`);
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

export function calculateShipping(customer, orderDraft, env) {
  const baseShipping = numericEnv(env.SHIPPING_COST, 9.95);
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

  await fetch(`${env.SITE_URL}/api/send-order-emails`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Auth": env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify({ orderId }),
  });
}
