import {
  createSupabaseBrowserClient,
  formatEuro,
  getCart,
  setCart,
} from "./app-config.js";

const supabase = createSupabaseBrowserClient();

export async function fetchProductsByIds(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,description,image_url,category,stock,active,created_at")
    .in("id", uniqueIds)
    .eq("active", true);

  if (error) throw error;
  return data || [];
}

export async function fetchActiveProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,description,image_url,category,stock,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export function buildCartDetails(products, cart = getCart()) {
  const productMap = new Map((products || []).map((product) => [String(product.id), product]));
  const lines = [];
  let total = 0;

  for (const item of cart) {
    const product = productMap.get(String(item.id));
    if (!product) continue;

    const stock = Math.max(0, Number(product.stock ?? 0));
    const qty = Math.min(item.qty, stock || item.qty);
    const lineTotal = Number(product.price || 0) * qty;
    total += lineTotal;

    lines.push({
      ...product,
      qty,
      lineTotal,
      available: stock > 0,
      stock,
    });
  }

  return { lines, total: Number(total.toFixed(2)) };
}

export function syncCartToStock(products, cart = getCart()) {
  const productMap = new Map((products || []).map((product) => [String(product.id), product]));
  const nextCart = [];

  for (const item of cart) {
    const product = productMap.get(String(item.id));
    const stock = Math.max(0, Number(product?.stock ?? 0));
    if (!product || !product.active || stock <= 0) continue;

    nextCart.push({
      id: String(product.id),
      qty: Math.min(item.qty, stock),
    });
  }

  setCart(nextCart);
  return nextCart;
}

export function buildCheckoutPayload(lines) {
  return lines.map((line) => ({
    id: String(line.id),
    qty: Math.max(1, Math.min(20, Number(line.qty || 1))),
  }));
}

export { formatEuro, getCart, setCart, supabase };
