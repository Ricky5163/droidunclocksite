import { buildLoginRedirect, escapeHtml, getCartCount, mergeCartItem, parseImages, setupAdminLogoShortcut } from "./app-config.js?v=auth10";
import { getCurrentUser, syncAccountLinks } from "./auth-utils.js?v=auth10";
import { setupLanguageSelector, t } from "./i18n.js?v=auth10";
import { fetchActiveProducts, fetchProductBySlug, formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=auth10";

const detailElement = document.getElementById("productDetail");
const cartBadges = document.querySelectorAll("[data-cart-count]");
let currentLang = setupLanguageSelector();
let currentProduct;
let currentRelated = [];
let currentUser = null;
let currentGallery = [];
let activeGalleryIndex = 0;
let galleryZoom = 1;
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

function renderGalleryLightbox() {
  const image = currentGallery[activeGalleryIndex];
  const lightbox = detailElement.querySelector(".product-lightbox");
  const imageElement = detailElement.querySelector(".product-lightbox__image");
  const counter = detailElement.querySelector(".product-lightbox__counter");
  const zoomValue = detailElement.querySelector(".product-lightbox__zoom-value");

  if (!lightbox || !imageElement || !image) return;
  imageElement.src = image;
  imageElement.style.transform = `scale(${galleryZoom})`;
  if (counter) counter.textContent = `${activeGalleryIndex + 1} / ${currentGallery.length}`;
  if (zoomValue) zoomValue.textContent = `${Math.round(galleryZoom * 100)}%`;
}

function openGalleryLightbox(index = activeGalleryIndex) {
  activeGalleryIndex = Math.max(0, Math.min(index, currentGallery.length - 1));
  galleryZoom = 1;
  document.body.classList.add("product-lightbox-open");
  detailElement.querySelector(".product-lightbox")?.classList.add("is-open");
  renderGalleryLightbox();
}

function closeGalleryLightbox() {
  document.body.classList.remove("product-lightbox-open");
  detailElement.querySelector(".product-lightbox")?.classList.remove("is-open");
}

function changeGalleryZoom(amount) {
  galleryZoom = Math.max(1, Math.min(3, Number((galleryZoom + amount).toFixed(2))));
  renderGalleryLightbox();
}

function moveGalleryImage(direction) {
  if (!currentGallery.length) return;
  activeGalleryIndex = (activeGalleryIndex + direction + currentGallery.length) % currentGallery.length;
  galleryZoom = 1;
  renderGalleryLightbox();
}

function render(product, related = []) {
  currentProduct = product;
  currentRelated = related;
  const images = parseImages(product.images);
  const gallery = images.length ? images : [getProductImage(product)];
  currentGallery = gallery;
  activeGalleryIndex = 0;
  galleryZoom = 1;
  const stock = Math.max(0, Number(product.stock ?? 0));
  const price = Number(product.price || 0);
  const effectivePrice = getEffectivePrice(product);

  document.title = `Droidunclock | ${product.name}`;
  detailElement.innerHTML = `
    <div class="product-gallery">
      <button class="product-gallery__main-button" type="button" aria-label="Open product photo">
        <img class="product-gallery__main" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(product.name)}" />
        <span class="product-gallery__zoom-hint">Zoom</span>
      </button>
      <div class="product-gallery__thumbs">
        ${gallery.map((image, index) => `<button class="product-gallery__thumb ${index === 0 ? "is-active" : ""}" type="button"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" /></button>`).join("")}
      </div>
      <div class="product-lightbox" role="dialog" aria-modal="true" aria-label="Product photo viewer">
        <div class="product-lightbox__bar">
          <button class="product-lightbox__button" type="button" data-lightbox-close>Close</button>
          <span class="product-lightbox__counter">1 / ${gallery.length}</span>
        </div>
        <div class="product-lightbox__stage">
          <button class="product-lightbox__nav product-lightbox__nav--prev" type="button" data-lightbox-prev aria-label="Previous photo">&lt;</button>
          <img class="product-lightbox__image" src="${escapeHtml(gallery[0])}" alt="${escapeHtml(product.name)}" />
          <button class="product-lightbox__nav product-lightbox__nav--next" type="button" data-lightbox-next aria-label="Next photo">&gt;</button>
        </div>
        <div class="product-lightbox__controls">
          <button class="product-lightbox__button" type="button" data-zoom-out>-</button>
          <span class="product-lightbox__zoom-value">100%</span>
          <button class="product-lightbox__button" type="button" data-zoom-in>+</button>
        </div>
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

  detailElement.querySelector(".product-gallery__main-button")?.addEventListener("click", () => {
    openGalleryLightbox(activeGalleryIndex);
  });

  detailElement.querySelectorAll(".product-gallery__thumb").forEach((thumb, index) => {
    thumb.addEventListener("click", () => {
      activeGalleryIndex = index;
      detailElement.querySelector(".product-gallery__main").src = gallery[index];
      detailElement.querySelectorAll(".product-gallery__thumb").forEach((item) => item.classList.remove("is-active"));
      thumb.classList.add("is-active");
    });
  });

  detailElement.querySelector("[data-lightbox-close]")?.addEventListener("click", closeGalleryLightbox);
  detailElement.querySelector(".product-lightbox")?.addEventListener("click", (event) => {
    if (event.target.classList.contains("product-lightbox")) closeGalleryLightbox();
  });
  detailElement.querySelector("[data-lightbox-prev]")?.addEventListener("click", () => moveGalleryImage(-1));
  detailElement.querySelector("[data-lightbox-next]")?.addEventListener("click", () => moveGalleryImage(1));
  detailElement.querySelector("[data-zoom-out]")?.addEventListener("click", () => changeGalleryZoom(-0.25));
  detailElement.querySelector("[data-zoom-in]")?.addEventListener("click", () => changeGalleryZoom(0.25));
  detailElement.querySelector(".product-lightbox__image")?.addEventListener("click", () => {
    galleryZoom = galleryZoom > 1 ? 1 : 2;
    renderGalleryLightbox();
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

document.addEventListener("keydown", (event) => {
  if (!detailElement.querySelector(".product-lightbox.is-open")) return;
  if (event.key === "Escape") closeGalleryLightbox();
  if (event.key === "ArrowLeft") moveGalleryImage(-1);
  if (event.key === "ArrowRight") moveGalleryImage(1);
  if (event.key === "+" || event.key === "=") changeGalleryZoom(0.25);
  if (event.key === "-") changeGalleryZoom(-0.25);
});

init();
