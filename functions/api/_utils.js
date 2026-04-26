import { createClient } from "@supabase/supabase-js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createServiceClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

export function assertEnv(env, names) {
  return names.filter((name) => !env[name]);
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
    "Access-Control-Allow-Headers": "Content-Type, X-Internal-Auth",
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

export async function buildValidatedOrder(cart, supabase) {
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length) {
    throw new Error("Carrinho invalido.");
  }

  const ids = normalizedCart.map((item) => item.id);
  const { data: products, error } = await supabase
    .from("products")
    .select("id,name,price,discount_price,stock,active")
    .in("id", ids);

  if (error) throw new Error(error.message);

  const productMap = new Map(
    (products || [])
      .filter((product) => product?.active)
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

export async function markOrderPaid(supabase, orderId, updates = {}) {
  const { data: currentOrder, error: currentError } = await supabase
    .from("orders")
    .select("id,payment_status,order_status,customer_email,total_amount,payment_method")
    .eq("id", orderId)
    .single();

  if (currentError) throw new Error(currentError.message);
  if (currentOrder.payment_status === "paid") {
    await retireSoldProducts(supabase, orderId);
    return { order: currentOrder, changed: false };
  }

  const { data: updatedOrder, error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      order_status: "Paid",
      ...updates,
    })
    .eq("id", orderId)
    .select("id,payment_status,order_status,customer_email,total_amount,payment_method")
    .single();

  if (updateError) throw new Error(updateError.message);

  await retireSoldProducts(supabase, orderId);

  return { order: updatedOrder, changed: true };
}

export async function retireSoldProducts(supabase, orderId) {
  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id,quantity")
    .eq("order_id", orderId);

  if (itemsError) throw new Error(itemsError.message);

  const productIds = new Set();
  for (const item of items || []) {
    const productId = String(item.product_id || "").trim();
    if (productId) productIds.add(productId);
  }

  for (const productId of productIds) {
    const { error: updateError } = await supabase
      .from("products")
      .update({
        stock: 0,
        active: false,
      })
      .eq("id", productId);

    if (updateError) throw new Error(updateError.message);
  }
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
