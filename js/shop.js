import { escapeHtml, getCartCount, mergeCartItem, setupAdminLogoShortcut } from "./app-config.js?v=admin1";
import { setupLanguageSelector, t } from "./i18n.js?v=lang2";
import { fetchActiveProducts, formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=lang2";

const statusElement = document.getElementById("status");
const gridElement = document.getElementById("grid");
const searchElement = document.getElementById("search");
const categoryElement = document.getElementById("category");
const cartBadges = document.querySelectorAll("[data-cart-count]");

let allProducts = [];
let currentLang = setupLanguageSelector();
setupAdminLogoShortcut();

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function updateCartBadge() {
  const count = getCartCount();
  cartBadges.forEach((badge) => {
    badge.textContent = `${t("navCart", currentLang)} (${count})`;
  });
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function fallbackProducts() {
  return [
    {
      id: "demo-iphone-13",
      slug: "iphone-13-refurbished",
      name: "iPhone 13 128GB",
      brand: "Apple",
      model: "iPhone 13",
      category: "Refurbished Phones",
      condition: "Excellent",
      stock: 4,
      price: 449,
      discount_price: 399,
      description: "Refurbished, tested, unlocked, and ready for worldwide delivery.",
      images: ["https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "demo-samsung-screen",
      slug: "samsung-s22-screen",
      name: "Samsung Galaxy S22 Screen",
      brand: "Samsung",
      model: "Galaxy S22",
      category: "Phone Screens",
      condition: "New",
      stock: 8,
      price: 129,
      description: "Premium replacement screen for professional repair use.",
      images: ["https://images.unsplash.com/photo-1581993192873-b8aa6a7d53df?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "demo-battery",
      slug: "iphone-12-battery",
      name: "iPhone 12 Battery",
      brand: "Apple",
      model: "iPhone 12",
      category: "Batteries",
      condition: "New",
      stock: 12,
      price: 49,
      description: "Replacement battery with warranty information included.",
      images: ["https://images.unsplash.com/photo-1603539444875-76e7684265f6?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
  ];
}

function productUrl(product) {
  return `product.html?slug=${encodeURIComponent(product.slug || product.id)}`;
}

function productCard(product) {
  const stock = Math.max(0, Number(product.stock ?? 0));
  const price = Number(product.price || 0);
  const effectivePrice = getEffectivePrice(product);
  const hasDiscount = effectivePrice < price;

  return `
    <article class="product-card">
      <a class="product-card__media" href="${productUrl(product)}">
        <img class="product-card__image" src="${escapeHtml(getProductImage(product))}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </a>
      <div class="product-card__body">
        <div class="product-card__head">
          <div>
            <span class="availability ${stock > 0 ? "availability--ok" : "availability--empty"}">
              ${stock > 0 ? t("inStock", currentLang) : t("outOfStock", currentLang)}
            </span>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="product-meta">${escapeHtml(product.brand || "Droidunclock")} · ${escapeHtml(product.model || product.category || "")}</p>
          </div>
          <div class="price-stack">
            ${hasDiscount ? `<span>${formatEuro(price)}</span>` : ""}
            <strong>${formatEuro(effectivePrice)}</strong>
          </div>
        </div>
        <p class="product-card__description">${escapeHtml(product.description || "Premium product with secure checkout and warranty information.")}</p>
        <div class="product-specs">
          <span>${escapeHtml(product.category || "Product")}</span>
          <span>${escapeHtml(product.condition || "New")}</span>
        </div>
        <div class="product-card__footer">
          <button class="btn btn--ghost btn--small" data-add="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>${t("addToCart", currentLang)}</button>
          <button class="btn btn--primary btn--small" data-buy="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>${t("buyNow", currentLang)}</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts(products) {
  if (!gridElement) return;
  if (!products.length) {
    gridElement.innerHTML = `<div class="empty-state"><h3>No products found</h3><p>Try another category or search term.</p></div>`;
    return;
  }

  gridElement.innerHTML = products.map(productCard).join("");

  gridElement.querySelectorAll("[data-add], [data-buy]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-add") || button.getAttribute("data-buy");
      const product = allProducts.find((item) => String(item.id) === id);
      if (!product) return;
      mergeCartItem(product.id, Number(product.stock ?? 0));
      updateCartBadge();
      if (button.hasAttribute("data-buy")) window.location.href = "checkout.html";
      else setStatus(`${product.name} added to cart.`, "success");
    });
  });
}

function applyFilters() {
  const query = normalize(searchElement?.value);
  const category = normalize(categoryElement?.value);
  const filtered = allProducts.filter((product) => {
    const text = normalize(`${product.name} ${product.brand} ${product.model} ${product.category} ${product.description}`);
    return (!query || text.includes(query)) && (!category || normalize(product.category) === category);
  });
  renderProducts(filtered);
}

async function init() {
  updateCartBadge();
  setStatus("Loading products...");
  try {
    const products = await fetchActiveProducts();
    allProducts = products.length ? products : fallbackProducts();
    renderProducts(allProducts);
    setStatus("");
  } catch (error) {
    allProducts = fallbackProducts();
    renderProducts(allProducts);
    setStatus("Demo products are shown until Supabase products are configured.", "neutral");
  }
}

searchElement?.addEventListener("input", applyFilters);
categoryElement?.addEventListener("change", applyFilters);
window.addEventListener("cart:updated", updateCartBadge);
document.querySelector("[data-language-select]")?.addEventListener("change", () => {
  currentLang = localStorage.getItem("language") || "en";
  updateCartBadge();
  renderProducts(allProducts);
});

init();
