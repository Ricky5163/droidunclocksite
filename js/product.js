import { escapeHtml, getCartCount, mergeCartItem, parseImages, setupAdminLogoShortcut } from "./app-config.js?v=supa1";
import { setupLanguageSelector, t } from "./i18n.js?v=lang2";
import { fetchActiveProducts, fetchProductBySlug, formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=lang2";

const detailElement = document.getElementById("productDetail");
const cartBadges = document.querySelectorAll("[data-cart-count]");
let currentLang = setupLanguageSelector();
let currentProduct;
setupAdminLogoShortcut();

function updateCartBadge() {
  cartBadges.forEach((badge) => {
    badge.textContent = `${t("navCart", currentLang)} (${getCartCount()})`;
  });
}

function demoProduct() {
  return {
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
    technical_details: "128GB storage, unlocked, tested display, battery health checked.",
    warranty_info: "Warranty included. Coverage depends on product category and local law.",
    delivery_info: "International shipping available. Netherlands repair pickup by arrangement.",
    images: [
      "https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1200&q=80",
    ],
  };
}

function render(product, related = []) {
  currentProduct = product;
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
      <span class="eyebrow">${escapeHtml(product.category || "Product")}</span>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="muted">${escapeHtml(product.description || "")}</p>
      <div class="product-specs product-specs--large">
        <span>${escapeHtml(product.brand || "Brand")}</span>
        <span>${escapeHtml(product.model || "Model")}</span>
        <span>${escapeHtml(product.condition || "New")}</span>
        <span>${stock > 0 ? t("inStock", currentLang) : t("outOfStock", currentLang)}</span>
      </div>
      <div class="price-stack price-stack--hero">
        ${effectivePrice < price ? `<span>${formatEuro(price)}</span>` : ""}
        <strong>${formatEuro(effectivePrice)}</strong>
      </div>
      <div class="hero-actions">
        <button class="btn btn--ghost" id="addToCart">${t("addToCart", currentLang)}</button>
        <button class="btn btn--primary" id="buyNow">${t("buyNow", currentLang)}</button>
      </div>
      <div class="detail-panels">
        <section>
          <h2>${t("techDetails", currentLang)}</h2>
          <p>${escapeHtml(product.technical_details || "Technical information will be confirmed before dispatch or repair.")}</p>
        </section>
        <section>
          <h2>${t("warrantyInfo", currentLang)}</h2>
          <p>${escapeHtml(product.warranty_info || "Warranty included for eligible products and repairs.")}</p>
        </section>
        <section>
          <h2>${t("deliveryInfo", currentLang)}</h2>
          <p>${escapeHtml(product.delivery_info || "International shipping and Netherlands pickup options are available by arrangement.")}</p>
        </section>
      </div>
    </article>
    <section class="related-products">
      <div class="section-head"><span class="eyebrow">${t("details", currentLang)}</span><h2>${t("relatedProducts", currentLang)}</h2></div>
      <div class="product-grid">
        ${related
          .slice(0, 3)
          .map(
            (item) => `
              <article class="product-card">
                <a class="product-card__media" href="product.html?slug=${encodeURIComponent(item.slug || item.id)}">
                  <img class="product-card__image" src="${escapeHtml(getProductImage(item))}" alt="${escapeHtml(item.name)}" />
                </a>
                <div class="product-card__body">
                  <h3>${escapeHtml(item.name)}</h3>
                  <strong>${formatEuro(getEffectivePrice(item))}</strong>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;

  detailElement.querySelector("#addToCart")?.addEventListener("click", () => {
    mergeCartItem(product.id, stock);
    updateCartBadge();
  });

  detailElement.querySelector("#buyNow")?.addEventListener("click", () => {
    mergeCartItem(product.id, stock);
    window.location.href = "checkout.html";
  });

  detailElement.querySelectorAll(".product-gallery__thumbs img").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      detailElement.querySelector(".product-gallery__main").src = thumb.src;
    });
  });
}

async function init() {
  updateCartBadge();
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
  if (currentProduct) render(currentProduct, []);
});

init();
