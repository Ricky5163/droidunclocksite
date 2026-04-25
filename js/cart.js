import { escapeHtml, setupAdminLogoShortcut } from "./app-config.js?v=supa1";
import { setupLanguageSelector, t } from "./i18n.js?v=lang2";
import {
  buildCartDetails,
  fetchProductsByIds,
  formatEuro,
  getCart,
  getProductImage,
  setCart,
  syncCartToStock,
} from "./storefront.js?v=lang2";

const cartListElement = document.getElementById("cartList");
const statusElement = document.getElementById("status");
const subtotalElement = document.getElementById("subtotal");
const shippingElement = document.getElementById("shipping");
const totalElement = document.getElementById("total");
const checkoutButton = document.getElementById("goCheckout");
const summaryCountElement = document.getElementById("summaryCount");
let currentLines = [];
let currentLang = setupLanguageSelector();
setupAdminLogoShortcut();

const SHIPPING_COST = 9.95;

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function totals(lines, subtotal) {
  const shipping = lines.length ? SHIPPING_COST : 0;
  return { subtotal, shipping, total: subtotal + shipping };
}

function updateSummary(lines, subtotal) {
  const next = totals(lines, subtotal);
  subtotalElement.textContent = formatEuro(next.subtotal);
  shippingElement.textContent = formatEuro(next.shipping);
  totalElement.textContent = formatEuro(next.total);
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  summaryCountElement.textContent = `${count} item${count === 1 ? "" : "s"}`;
  checkoutButton.classList.toggle("hidden", !lines.length);
}

function updateQuantity(productId, nextQty) {
  const cart = getCart().map((item) => ({ ...item }));
  const index = cart.findIndex((item) => item.id === String(productId));
  if (index === -1) return;
  if (nextQty <= 0) cart.splice(index, 1);
  else cart[index].qty = nextQty;
  setCart(cart);
  render();
}

function renderLines(lines, subtotal) {
  if (!lines.length) {
    cartListElement.innerHTML = `
      <div class="empty-state">
        <h3>${t("emptyCart", currentLang)}</h3>
        <p>Choose products or repair services to continue.</p>
        <a class="btn btn--primary" href="shop.html">${t("shopNow", currentLang)}</a>
      </div>
    `;
    updateSummary([], 0);
    return;
  }

  cartListElement.innerHTML = lines
    .map(
      (line) => `
        <article class="cart-line">
          <div class="cart-line__main">
            <img class="cart-line__image" src="${escapeHtml(getProductImage(line))}" alt="${escapeHtml(line.name)}" />
            <div>
              <p class="eyebrow">${escapeHtml(line.category || "Product")}</p>
              <h3>${escapeHtml(line.name)}</h3>
              <p class="muted">${escapeHtml(line.brand || "")} ${escapeHtml(line.model || "")} · ${escapeHtml(line.condition || "")}</p>
            </div>
          </div>
          <div class="cart-line__controls">
            <span class="availability ${line.available ? "availability--ok" : "availability--empty"}">
              ${line.available ? t("inStock", currentLang) : t("outOfStock", currentLang)}
            </span>
            <div class="qty-control">
              <button type="button" data-dec="${line.id}" aria-label="Decrease quantity">-</button>
              <span>${line.qty}</span>
              <button type="button" data-inc="${line.id}" aria-label="Increase quantity">+</button>
            </div>
            <strong>${formatEuro(line.lineTotal)}</strong>
            <button class="link-button" type="button" data-del="${line.id}">Remove</button>
          </div>
        </article>
      `,
    )
    .join("");

  cartListElement.querySelectorAll("[data-dec]").forEach((button) => {
    button.addEventListener("click", () => {
      const line = currentLines.find((item) => String(item.id) === button.dataset.dec);
      if (line) updateQuantity(line.id, line.qty - 1);
    });
  });

  cartListElement.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", () => {
      const line = currentLines.find((item) => String(item.id) === button.dataset.inc);
      if (line) updateQuantity(line.id, Math.min(line.qty + 1, line.stock));
    });
  });

  cartListElement.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", () => updateQuantity(button.dataset.del, 0));
  });

  updateSummary(lines, subtotal);
}

async function render() {
  const cart = getCart();
  if (!cart.length) {
    currentLines = [];
    renderLines([], 0);
    return;
  }

  setStatus("Synchronizing cart...");
  try {
    const products = await fetchProductsByIds(cart.map((item) => item.id));
    syncCartToStock(products, cart);
    const details = buildCartDetails(products, getCart());
    currentLines = details.lines;
    renderLines(details.lines, details.total);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Could not update cart.", "error");
  }
}

document.querySelector("[data-language-select]")?.addEventListener("change", () => {
  currentLang = localStorage.getItem("language") || "en";
  renderLines(currentLines, currentLines.reduce((sum, line) => sum + line.lineTotal, 0));
});

render();
