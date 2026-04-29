import {
  createSupabaseBrowserClient,
  formatEuro,
  getEffectivePrice,
  getProductImage,
  getCart,
  setCart,
} from "./app-config.js?v=auth5";

const supabase = createSupabaseBrowserClient();

const PRODUCT_COLUMNS = "id,name,slug,brand,model,category,description,price,discount_price,condition,stock,images,image_url,active,created_at,publish_at,technical_details,warranty_info,delivery_info";
const LEGACY_PRODUCT_COLUMNS = PRODUCT_COLUMNS.replace(",publish_at", "");

function availableProductsQuery(options = {}) {
  const query = supabase
    .from("products")
    .select(options.legacy ? LEGACY_PRODUCT_COLUMNS : PRODUCT_COLUMNS)
    .eq("active", true)
    .gt("stock", 0);

  return options.legacy ? query : query.or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`);
}

function isMissingPublishAt(error) {
  return /publish_at/i.test(error?.message || "") || /publish_at/i.test(error?.details || "");
}

async function runProductsQuery(buildQuery) {
  const { data, error } = await buildQuery(false);
  if (!error) return data || [];
  if (!isMissingPublishAt(error)) throw error;

  const fallback = await buildQuery(true);
  if (fallback.error) throw fallback.error;
  return fallback.data || [];
}

export async function fetchProductsByIds(ids) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  return runProductsQuery((legacy) => availableProductsQuery({ legacy }).in("id", uniqueIds));
}

export async function fetchActiveProducts() {
  return runProductsQuery((legacy) => availableProductsQuery({ legacy }).order("created_at", { ascending: false }));
}

export async function fetchProductBySlug(slugOrId) {
  const value = String(slugOrId || "").trim();
  if (!value) return null;

  const slugResult = await runProductsQuery((legacy) => availableProductsQuery({ legacy }).eq("slug", value).limit(1));
  const slugMatch = slugResult[0] || null;

  if (slugMatch) return slugMatch;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }

  const idResult = await runProductsQuery((legacy) => availableProductsQuery({ legacy }).eq("id", value).limit(1));
  return idResult[0] || null;
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
