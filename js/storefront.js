import {
  createSupabaseBrowserClient,
  formatEuro,
  getEffectivePrice,
  getProductImage,
  getCart,
  setCart,
} from "./app-config.js?v=auth5";

const supabase = createSupabaseBrowserClient();

export async function fetchProductsByIds(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,brand,model,category,description,price,discount_price,condition,stock,images,image_url,active,created_at,technical_details,warranty_info,delivery_info")
    .in("id", uniqueIds)
    .eq("active", true)
    .gt("stock", 0);

  if (error) throw error;
  return data || [];
}

export async function fetchActiveProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,brand,model,category,description,price,discount_price,condition,stock,images,image_url,active,created_at,technical_details,warranty_info,delivery_info")
    .eq("active", true)
    .gt("stock", 0)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchProductBySlug(slugOrId) {
  const value = String(slugOrId || "").trim();
  if (!value) return null;

  const { data: slugMatch, error: slugError } = await supabase
    .from("products")
    .select("id,name,slug,brand,model,category,description,price,discount_price,condition,stock,images,image_url,active,created_at,technical_details,warranty_info,delivery_info")
    .eq("active", true)
    .gt("stock", 0)
    .eq("slug", value)
    .maybeSingle();

  if (slugError) throw slugError;
  if (slugMatch) return slugMatch;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,name,slug,brand,model,category,description,price,discount_price,condition,stock,images,image_url,active,created_at,technical_details,warranty_info,delivery_info")
    .eq("active", true)
    .gt("stock", 0)
    .eq("id", value)
    .maybeSingle();

  if (error) throw error;
  return data;
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
    const price = getEffectivePrice(product);
    const lineTotal = price * qty;
    total += lineTotal;

    lines.push({
      ...product,
      image: getProductImage(product),
      price,
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

export { formatEuro, getCart, setCart, supabase, getProductImage, getEffectivePrice };
