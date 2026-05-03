import { buildLoginRedirect, escapeHtml, getCartCount, mergeCartItem, parseImages, setupAdminLogoShortcut } from "./app-config.js?v=auth6";
import { getCurrentUser, syncAccountLinks } from "./auth-utils.js?v=auth6";
import { setupLanguageSelector, t } from "./i18n.js?v=cart-fix2";
import { fetchActiveProducts, fetchProductBySlug, formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=cart-fix2";

const detailElement = document.getElementById("productDetail");
const cartBadges = document.querySelectorAll("[data-cart-count]");
let currentLang = setupLanguageSelector();
let currentProduct;
let currentRelated = [];
let currentUser = null;
setupAdminLogoShortcut();
syncAccountLinks().catch(() => null);

function updateCartBadge() {
  cartBadges.forEach((badge) => {
    badge.textContent = `${t("navCart", currentLang)} (${getCartCount()})`;
  });
}

function demoProduct() {
  return {
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
    description: "Smartphone fully functional and tested, with battery in good condition and no structural damage. Unlocked for European networks and prepared for daily use.",
    technical_details: "128GB storage, unlocked, tested OLED display, tested Face ID, checked cameras, clean speakers, and reliable charging.",
    warranty_info: "6-month Droidunclock warranty for eligible hardware faults. The device is inspected before dispatch and packed securely.",
    delivery_info: "Fast delivery in the Netherlands. European delivery available where supported at checkout.",
    images: [
      "https://images.unsplash.com/photo-1603891128711-11b4b03bb138?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=1200&q=80",
    ],
  };
}

function batteryLabel(product) {
  return product.battery_health || product.batteryHealth || "85%+";
}

function warrantyLabel(product) {
  const warrantyInfo = product.warranty_info ? String(product.warranty_info) : "";
  return product.warranty || warrantyInfo.match(/\d+\s*(months?|dias?|days?)/i)?.[0] || "6 months";
}

function conditionText(product) {
  const condition = product.condition || product.condition_label || "Excellent";
  if (/excellent|like new|como novo/i.test(condition)) {
    return "Excellent condition, with no visible structural damage and minimal signs of use.";
  }
  if (/good|very good|used|usado/i.test(condition)) {
    return "Very good working condition, with normal light signs of previous use.";
  }
  return "Professionally inspected, cleaned, and tested before dispatch.";
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

function relatedCard(item) {
  return `
    <article class="product-card product-card--compact">
      <a class="product-card__media" href="product.html?slug=${encodeURIComponent(item.slug || item.id)}">
        <img class="product-card__image" src="${escapeHtml(getProductImage(item))}" alt="${escapeHtml(item.name)}" />
      </a>
      <div class="product-card__body">
        <span class="availability availability--ok">${escapeHtml(item.condition || "Refurbished")}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="product-meta">${escapeHtml(item.brand || "Droidunclock")}</p>
        <strong>${formatEuro(getEffectivePrice(item))}</strong>
      </div>
    </article>
  `;
}

function render(product, related = []) {
  currentProduct = product;
  currentRelated = related;
  const images = parseImages(product.images);
  const gallery = images.length ? images : [getProductImage(product)];
  const stock = Math.max(0, Number(product.stock ?? 0));
  const price = Number(product.price || 0);
  const effectivePrice = getEffectivePrice(product);

  document.title = `Droidunclock | ${product.name}`;
  detailElement.innerHTML = `
    <div class="product-gallery">
      <img class="product-gallery__main" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(product.name)}" />
      <div class="product-gallery__thumbs">
        ${gallery.map((image) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" />`).join("")}
      </div>
    </div>
    <article class="product-buybox">
      <span class="eyebrow">Refurbished phone</span>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="muted">${escapeHtml(product.description || "Professionally tested refurbished phone with warranty and secure checkout.")}</p>
      <div class="product-specs product-specs--large">
        <span>${escapeHtml(product.brand || "Brand")}</span>
        <span>${escapeHtml(product.model || "Model")}</span>
        <span>${escapeHtml(product.condition || "Refurbished")}</span>
        <span>${stock > 0 ? t("inStock", currentLang) : t("outOfStock", currentLang)}</span>
      </div>
      <div class="price-stack price-stack--hero">
        ${effectivePrice < price ? `<span>${formatEuro(price)}</span>` : ""}
        <strong>${formatEuro(effectivePrice)}</strong>
      </div>
      <div class="product-confidence-grid">
        <section>
          <span>Condition</span>
          <strong>${escapeHtml(product.condition || "Excellent")}</strong>
          <p>${escapeHtml(conditionText(product))}</p>
        </section>
        <section>
          <span>Battery</span>
          <strong>${escapeHtml(batteryLabel(product))}</strong>
          <p>Estimated battery health checked during inspection.</p>
        </section>
        <section>
          <span>Warranty</span>
          <strong>${escapeHtml(warrantyLabel(product))}</strong>
          <p>Coverage included for eligible hardware faults.</p>
        </section>
      </div>
      <div class="hero-actions">
        <button class="btn btn--ghost" id="addToCart" ${stock > 0 ? "" : "disabled"}>${t("addToCart", currentLang)}</button>
        <button class="btn btn--primary btn--xl" id="buyNow" ${stock > 0 ? "" : "disabled"}>${t("buyNow", currentLang)}</button>
      </div>
      <div class="checkout-trust-row" aria-label="Trust information">
        <span>Fast delivery in the Netherlands</span>
        <span>14-day returns</span>
        <span>Secure Stripe / PayPal payment</span>
      </div>
      <div class="detail-panels">
        <section>
          <h2>${t("techDetails", currentLang)}</h2>
          <p>${escapeHtml(product.technical_details || "Display, battery, cameras, speakers, charging, buttons, and network reliability are checked before dispatch.")}</p>
        </section>
        <section>
          <h2>${t("warrantyInfo", currentLang)}</h2>
          <p>${escapeHtml(product.warranty_info || "6-month warranty for eligible refurbished phones, plus clear support if something is not as described.")}</p>
        </section>
        <section>
          <h2>${t("deliveryInfo", currentLang)}</h2>
          <p>${escapeHtml(product.delivery_info || "Fast delivery in the Netherlands. European shipping options are shown at checkout when available.")}</p>
        </section>
      </div>
    </article>
    <section class="related-products">
      <div class="section-head"><span class="eyebrow">More options</span><h2>${t("relatedProducts", currentLang)}</h2></div>
      <div class="product-grid">
        ${related.length ? related.slice(0, 3).map(relatedCard).join("") : relatedCard(demoProduct())}
      </div>
    </section>
  `;

  detailElement.querySelector("#addToCart")?.addEventListener("click", async (event) => {
    if (!(await requireLogin(`product.html?slug=${encodeURIComponent(product.slug || product.id)}`))) return;
    mergeCartItem(product.id, stock);
    updateCartBadge();
    setButtonLoading(event.currentTarget, "Added");
  });

  detailElement.querySelector("#buyNow")?.addEventListener("click", async (event) => {
    if (!(await requireLogin("checkout.html"))) return;
    mergeCartItem(product.id, stock);
    setButtonLoading(event.currentTarget, "Opening checkout...");
    window.setTimeout(() => {
      window.location.href = "checkout.html";
    }, 180);
  });

  detailElement.querySelectorAll(".product-gallery__thumbs img").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      detailElement.querySelector(".product-gallery__main").src = thumb.src;
    });
  });
}

async function init() {
  updateCartBadge();
  currentUser = await getCurrentUser({ wait: true, timeoutMs: 700 }).catch(() => null);
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || params.get("id");
  try {
    const product = (await fetchProductBySlug(slug)) || demoProduct();
    const products = await fetchActiveProducts().catch(() => []);
    render(
      product,
      products.filter((item) => String(item.id) !== String(product.id) && item.category === product.category),
    );
  } catch {
    render(demoProduct(), []);
  }
}

document.querySelector("[data-language-select]")?.addEventListener("change", () => {
  currentLang = localStorage.getItem("language") || "en";
  updateCartBadge();
  if (currentProduct) render(currentProduct, currentRelated);
});

init();
