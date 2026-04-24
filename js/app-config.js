const SUPABASE_URL = "https://eqklkfrxotoizpuacznc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa2xrZnJ4b3RvaXpwdWFjem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDAxMTAsImV4cCI6MjA4NTg3NjExMH0.Ex1LHdLN8Kfnu3ySY1JH7NUC9AM-TqXLnBiA56qE9Ow";

export const SITE_NAME = "Droidunclock";
export const WHATSAPP_NUMBER = "351965782553";
export const DEFAULT_LOGIN_REDIRECT = "shop.html";
export const VALID_LOCAL_PATHS = new Set([
  "index.html",
  "login.html",
  "shop.html",
  "cart.html",
  "checkout.html",
  "success.html",
  "cancel.html",
]);

let supabaseClient;

export function createSupabaseBrowserClient() {
  if (supabaseClient) return supabaseClient;

  if (!window.supabase?.createClient) {
    throw new Error("Supabase SDK indisponivel.");
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

export function formatEuro(value) {
  const number = Number(value || 0);
  return number.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
  });
}

export function buildWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getCart() {
  try {
    const stored = JSON.parse(localStorage.getItem("cart") || "[]");
    if (!Array.isArray(stored)) return [];

    return stored
      .map((item) => ({
        id: String(item?.id || "").trim(),
        qty: Math.max(1, Math.min(20, Number(item?.qty || 1))),
      }))
      .filter((item) => item.id);
  } catch {
    return [];
  }
}

export function setCart(items) {
  const normalized = Array.isArray(items)
    ? items
        .map((item) => ({
          id: String(item?.id || "").trim(),
          qty: Math.max(1, Math.min(20, Number(item?.qty || 1))),
        }))
        .filter((item) => item.id)
    : [];

  localStorage.setItem("cart", JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("cart:updated", { detail: normalized }));
}

export function clearCart() {
  localStorage.removeItem("cart");
  window.dispatchEvent(new CustomEvent("cart:updated", { detail: [] }));
}

export function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

export function mergeCartItem(productId, maxStock = Infinity) {
  const id = String(productId || "").trim();
  if (!id) return;

  const cart = getCart();
  const existing = cart.find((item) => item.id === id);

  if (existing) {
    existing.qty = Math.min(existing.qty + 1, Number(maxStock) || existing.qty + 1);
  } else {
    cart.push({ id, qty: 1 });
  }

  setCart(cart);
}

export function sanitizeReturnPath(path, fallback = DEFAULT_LOGIN_REDIRECT) {
  if (!path) return fallback;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("//")) {
    return fallback;
  }

  const clean = path.replace(/^\//, "");
  const [pathname, query = ""] = clean.split("?");

  if (!VALID_LOCAL_PATHS.has(pathname)) return fallback;
  return query ? `${pathname}?${query}` : pathname;
}

export function buildLoginRedirect(path = window.location.pathname.split("/").pop() || DEFAULT_LOGIN_REDIRECT) {
  const safePath = sanitizeReturnPath(path, DEFAULT_LOGIN_REDIRECT);
  return `login.html?next=${encodeURIComponent(safePath)}`;
}

export function getPostLoginTarget() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeReturnPath(params.get("next"), DEFAULT_LOGIN_REDIRECT);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
