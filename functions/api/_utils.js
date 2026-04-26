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
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = normalizeEmail(userData?.user?.email);
  if (userError || !email) return null;

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("id,email,role")
    .eq("email", email)
    .maybeSingle();

  return adminError || !admin ? null : { ...admin, user: userData.user };
}

export async function requireAuthenticatedUser(request, supabase) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data?.user || null;
}

export async function encryptOrderCustomer(customer, env) {
  const encrypted = { ...customer };
  for (const field of sensitiveOrderFields()) {
    encrypted[field] = await encryptText(customer[field], env);
  }
  return encrypted;
}

export async function decryptOrderCustomer(order, env) {
  const decrypted = { ...order };
  for (const field of sensitiveOrderFields()) {
    decrypted[field] = await decryptText(order[field], env);
  }
  return decrypted;
}

function sensitiveOrderFields() {
  return ["customer_name", "customer_email", "customer_phone", "country", "address", "postal_code", "city"];
}

async function encryptText(value, env) {
  const text = String(value || "");
  const secret = orderDataSecret(env);
  if (!secret || !text || text.startsWith("enc:v1:")) return text;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await orderCryptoKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));

  return `enc:v1:${base64FromBytes(iv)}:${base64FromBytes(new Uint8Array(encrypted))}`;
}

async function decryptText(value, env) {
  const text = String(value || "");
  const secrets = orderDataSecrets(env);
  if (!secrets.length || !text.startsWith("enc:v1:")) return text;

  const [, version, ivBase64, encryptedBase64] = text.split(":");
  if (version !== "v1" || !ivBase64 || !encryptedBase64) return text;

  for (const secret of secrets) {
    try {
      const key = await orderCryptoKey(secret);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytesFromBase64(ivBase64) },
        key,
        bytesFromBase64(encryptedBase64)
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      // Try the next server-side secret for older orders.
    }
  }

  return "";
}

async function orderCryptoKey(secret) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function base64FromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bytesFromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function orderDataSecret(env) {
  return orderDataSecrets(env)[0];
}

function orderDataSecrets(env) {
  return [
    env.CHECKOUT_DATA_SECRET,
    env.ORDER_DATA_SECRET,
    env.INTERNAL_API_SECRET,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean);
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
  const { data: currentOrder, error: currentError } = await supabase
    .from("orders")
    .select("id,payment_status,order_status,customer_email,total_amount,payment_method,stock_reserved_at")
    .eq("id", orderId)
    .single();

  if (currentError) throw new Error(currentError.message);
  if (currentOrder.payment_status === "paid") {
    await reserveOrderStock(supabase, orderId);
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
    .select("id,payment_status,order_status,customer_email,total_amount,payment_method,stock_reserved_at")
    .single();

  if (updateError) throw new Error(updateError.message);

  await reserveOrderStock(supabase, orderId);

  return { order: updatedOrder, changed: true };
}

export async function reserveOrderStock(supabase, orderId) {
  const { error } = await supabase.rpc("reserve_order_stock", { p_order_id: orderId });
  if (error) throw new Error(error.message);
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
