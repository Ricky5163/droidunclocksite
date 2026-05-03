const runtimeConfig = window.DROIDUNCLOCK_CONFIG || {};

const SUPABASE_URL = runtimeConfig.SUPABASE_URL || "https://rtjfezznepfshhrpvjcf.supabase.co";
const SUPABASE_ANON_KEY =
  runtimeConfig.SUPABASE_ANON_KEY ||
  "sb_publishable_n3IsW1I0owLEaBsZj3WEuA_6SOfYMvV";

export const SITE_NAME = "Droidunclock";
export const WHATSAPP_NUMBER = runtimeConfig.WHATSAPP_NUMBER || "351965782553";
export const DEFAULT_LOGIN_REDIRECT = "account.html";
export const VALID_LOCAL_PATHS = new Set([
  "index.html",
  "login.html",
  "shop.html",
  "product.html",
  "cart.html",
  "checkout.html",
  "account.html",
  "admin.html",
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
  window.supabaseClient = supabaseClient;

  return supabaseClient;
}

export function formatEuro(value) {
  const number = Number(value || 0);
  return number.toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

export function buildWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function parseImages(images) {
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === "string" && images.trim()) {
    try {
      const parsed = JSON.parse(images);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return images
        .split(",")
        .map((image) => image.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function getProductImage(product) {
  const images = parseImages(product?.images);
  return images[0] || product?.image_url || "assets/img_2.jpg";
}

export function getEffectivePrice(product) {
  const price = Number(product?.price || 0);
  const discount = Number(product?.discount_price || 0);
  return discount > 0 && discount < price ? discount : price;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function isValidProductId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || "").trim());
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
      .filter((item) => isValidProductId(item.id));
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
        .filter((item) => isValidProductId(item.id))
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
  if (!isValidProductId(id)) return;

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

export function buildAuthEmailRedirect(path = DEFAULT_LOGIN_REDIRECT) {
  const safePath = sanitizeReturnPath(path, DEFAULT_LOGIN_REDIRECT);
  const url = new URL("login.html", window.location.origin);
  url.searchParams.set("next", safePath);
  return url.toString();
}

export function buildAdminLoginRedirect() {
  return buildLoginRedirect("admin.html");
}

export function getPostLoginTarget() {
  const params = new URLSearchParams(window.location.search);
  return sanitizeReturnPath(params.get("next"), DEFAULT_LOGIN_REDIRECT);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export function setupAdminLogoShortcut(selector = ".site-header .brand, .dashboard-header .brand") {
  document.querySelectorAll(selector).forEach((link) => {
    let clickTimer;
    let lastClick = 0;

    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "index.html";
      const now = Date.now();

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();

      if (now - lastClick < 360) {
        window.clearTimeout(clickTimer);
        window.location.href = buildAdminLoginRedirect();
        return;
      }

      lastClick = now;
      clickTimer = window.setTimeout(() => {
        window.location.href = href;
      }, 260);
    });
  });
}
