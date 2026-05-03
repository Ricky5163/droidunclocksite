import { buildLoginRedirect, escapeHtml, getCartCount, mergeCartItem, setupAdminLogoShortcut } from "./app-config.js?v=auth9";
import { getCurrentUser, syncAccountLinks } from "./auth-utils.js?v=auth9";
import { setupLanguageSelector, t } from "./i18n.js?v=auth9";
import { fetchActiveProducts, formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=auth9";

const statusElement = document.getElementById("status");
const gridElement = document.getElementById("grid");
const searchElement = document.getElementById("search");
const categoryElement = document.getElementById("category");
const cartBadges = document.querySelectorAll("[data-cart-count]");

let allProducts = [];
let currentUser = null;
let currentLang = setupLanguageSelector();
setupAdminLogoShortcut();
syncAccountLinks().catch(() => null);

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
      id: "11111111-1111-4111-8111-111111111111",
      slug: "iphone-11-64gb-refurbished",
      name: "iPhone 11 64GB",
      brand: "Apple",
      model: "iPhone 11",
      category: "Refurbished Phones",
      condition: "Good",
      condition_label: "Used",
      battery_health: "86%",
      warranty: "6 months",
      stock: 5,
      price: 279,
      discount_price: 249,
      description: "Unlocked refurbished iPhone 11, fully tested, cleaned, and ready for everyday use. Light visible signs of use only.",
      images: ["https://images.unsplash.com/photo-1574755393849-623942496936?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "iphone-12-128gb-refurbished",
      name: "iPhone 12 128GB",
      brand: "Apple",
      model: "iPhone 12",
      category: "Refurbished Phones",
      condition: "Excellent",
      condition_label: "Like New",
      battery_health: "89%",
      warranty: "6 months",
      stock: 4,
      price: 449,
      discount_price: 399,
      description: "Smartphone fully functional and tested, with battery in good condition and no structural damage.",
      images: ["https://images.unsplash.com/photo-1603891128711-11b4b03bb138?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      slug: "iphone-13-128gb-refurbished",
      name: "iPhone 13 128GB",
      brand: "Apple",
      model: "iPhone 13",
      category: "Refurbished Phones",
      condition: "Excellent",
      condition_label: "Like New",
      battery_health: "91%",
      warranty: "6 months",
      stock: 3,
      price: 539,
      discount_price: 499,
      description: "Premium refurbished iPhone 13 with clean display, tested cameras, stable battery health, and unlocked network use.",
      images: ["https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      slug: "samsung-galaxy-s21-128gb-refurbished",
      name: "Samsung Galaxy S21 128GB",
      brand: "Samsung",
      model: "Galaxy S21",
      category: "Refurbished Phones",
      condition: "Very Good",
      condition_label: "Refurbished",
      battery_health: "88%",
      warranty: "6 months",
      stock: 6,
      price: 319,
      discount_price: 279,
      description: "Compact Samsung flagship, tested for display, charging, cameras, speakers, and mobile network reliability.",
      images: ["https://images.unsplash.com/photo-1610945264803-c22b62d2a7b3?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      slug: "samsung-galaxy-s22-128gb-refurbished",
      name: "Samsung Galaxy S22 128GB",
      brand: "Samsung",
      model: "Galaxy S22",
      category: "Refurbished Phones",
      condition: "Excellent",
      condition_label: "Like New",
      battery_health: "90%",
      warranty: "6 months",
      stock: 4,
      price: 389,
      discount_price: 349,
      description: "Refurbished Galaxy S22 in excellent condition, unlocked, professionally inspected, and ready to use.",
      images: ["https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=900&q=80"],
      active: true,
    },
  ];
}

function productUrl(product) {
  return `product.html?slug=${encodeURIComponent(product.slug || product.id)}`;
}

function batteryLabel(product) {
  return product.battery_health || product.batteryHealth || "85%+";
}

function warrantyLabel(product) {
  const warrantyInfo = product.warranty_info ? String(product.warranty_info) : "";
  return product.warranty || warrantyInfo.match(/\d+\s*(months?|dias?|days?)/i)?.[0] || "6 months";
}

function conditionLabel(product) {
  return product.condition_label || product.condition || "Refurbished";
}

function isPhoneProduct(product) {
  const text = normalize(`${product.name} ${product.brand} ${product.model} ${product.category}`);
  return text.includes("iphone") || text.includes("samsung") || text.includes("galaxy") || text.includes("refurbished phone");
}

function setButtonLoading(button, label) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  window.setTimeout(() => {
    button.disabled = false;
    button.textContent = original;
  }, 700);
}

async function requireLogin(next = "shop.html") {
  currentUser = currentUser || (await getCurrentUser({ wait: true, timeoutMs: 1000 }).catch(() => null));
  if (currentUser) return true;
  window.location.href = buildLoginRedirect(next);
  return false;
}

function productCard(product) {
  const stock = Math.max(0, Number(product.stock ?? 0));
  const price = Number(product.price || 0);
  const effectivePrice = getEffectivePrice(product);
  const hasDiscount = effectivePrice < price;

  return `
    <article class="product-card product-card--premium">
      <a class="product-card__media" href="${productUrl(product)}">
        <span class="product-card__badge">Refurbished</span>
        <img class="product-card__image" src="${escapeHtml(getProductImage(product))}" alt="${escapeHtml(product.name)}" loading="lazy" />
      </a>
      <div class="product-card__body">
        <div class="product-card__head">
          <div>
            <span class="availability ${stock > 0 ? "availability--ok" : "availability--empty"}">
              ${stock > 0 ? t("inStock", currentLang) : t("outOfStock", currentLang)}
            </span>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="product-meta">${escapeHtml(product.brand || "Droidunclock")} - ${escapeHtml(product.model || product.category || "")}</p>
          </div>
          <div class="price-stack">
            ${hasDiscount ? `<span>${formatEuro(price)}</span>` : ""}
            <strong>${formatEuro(effectivePrice)}</strong>
          </div>
        </div>
        <p class="product-card__description">${escapeHtml(product.description || "Professionally tested refurbished phone with warranty and secure checkout.")}</p>
        <div class="product-specs">
          <span>${escapeHtml(conditionLabel(product))}</span>
          <span>Battery ${escapeHtml(batteryLabel(product))}</span>
          <span>${escapeHtml(warrantyLabel(product))} warranty</span>
        </div>
        <div class="product-card__trust">
          <span>Fast NL delivery</span>
          <span>14-day returns</span>
          <span>Stripe / PayPal</span>
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
      if (button.hasAttribute("data-buy")) {
        requireLogin("checkout.html").then((allowed) => {
          if (!allowed) return;
          mergeCartItem(product.id, Number(product.stock ?? 0));
          updateCartBadge();
          setButtonLoading(button, "Opening checkout...");
          window.setTimeout(() => {
            window.location.href = "checkout.html";
          }, 180);
        });
        return;
      }

      requireLogin("shop.html").then((allowed) => {
        if (!allowed) return;
        mergeCartItem(product.id, Number(product.stock ?? 0));
        updateCartBadge();
        setButtonLoading(button, "Added");
        setStatus(`${product.name} added to cart.`, "success");
      });
    });
  });
}

function applyFilters() {
  const query = normalize(searchElement?.value);
  const category = normalize(categoryElement?.value);
  const filtered = allProducts.filter((product) => {
    const text = normalize(`${product.name} ${product.brand} ${product.model} ${product.category} ${product.description} ${product.condition}`);
    const categoryMatch = normalize(product.category) === category || normalize(product.brand) === category;
    return (!query || text.includes(query)) && (!category || categoryMatch);
  });
  renderProducts(filtered);
}

async function init() {
  updateCartBadge();
  currentUser = await getCurrentUser({ wait: true, timeoutMs: 700 }).catch(() => null);
  setStatus("Loading refurbished phones...");
  try {
    const products = await fetchActiveProducts();
    const phoneProducts = products.filter(isPhoneProduct);
    allProducts = phoneProducts.length ? phoneProducts : fallbackProducts();
    renderProducts(allProducts);
    setStatus("");
  } catch (error) {
    allProducts = fallbackProducts();
    renderProducts(allProducts);
    setStatus("Demo refurbished phones are shown until Supabase products are configured.", "neutral");
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
