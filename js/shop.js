import { escapeHtml, mergeCartItem } from "./app-config.js";
import { logoutAndRedirect, requireAuth } from "./auth-utils.js";
import { fetchActiveProducts, formatEuro } from "./storefront.js";

const statusElement = document.getElementById("status");
const gridElement = document.getElementById("grid");
const searchElement = document.getElementById("search");
const categoryElement = document.getElementById("category");
const logoutButton = document.getElementById("logoutBtn");
const cartButtons = document.querySelectorAll("[data-cart-count]");

let allProducts = [];

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function updateCartBadge() {
  const rawCart = JSON.parse(localStorage.getItem("cart") || "[]");
  const total = Array.isArray(rawCart)
    ? rawCart.reduce((sum, item) => sum + Number(item?.qty || 0), 0)
    : 0;

  cartButtons.forEach((button) => {
    button.textContent = `Carrinho (${total})`;
  });
}

function productCard(product) {
  const stock = Math.max(0, Number(product.stock ?? 0));
  const image = product.image_url || "assets/img_2.jpg";
  const buttonText = stock > 0 ? "Adicionar ao carrinho" : "Sem stock";

  return `
    <article class="product-card">
      <div class="product-card__media">
        <img class="product-card__image" src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" />
      </div>
      <div class="product-card__body">
        <div class="product-card__head">
          <div>
            <p class="eyebrow">${escapeHtml(product.category || "Produto")}</p>
            <h3>${escapeHtml(product.name)}</h3>
          </div>
          <strong>${formatEuro(product.price)}</strong>
        </div>
        <p class="product-card__description">${escapeHtml(product.description || "Produto testado e validado para venda.")}</p>
        <div class="product-card__footer">
          <span class="availability ${stock > 0 ? "availability--ok" : "availability--empty"}">
            ${stock > 0 ? `${stock} em stock` : "Indisponivel"}
          </span>
          <button class="btn btn--primary btn--small" data-add="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>
            ${buttonText}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts(products) {
  if (!gridElement) return;

  if (!products.length) {
    gridElement.innerHTML = `
      <div class="empty-state">
        <h3>Sem resultados</h3>
        <p>Nao encontrámos produtos com esse filtro. Ajusta a pesquisa e tenta novamente.</p>
      </div>
    `;
    return;
  }

  gridElement.innerHTML = products.map(productCard).join("");

  gridElement.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-add");
      const product = allProducts.find((item) => String(item.id) === id);
      if (!product) return;

      mergeCartItem(product.id, Number(product.stock ?? 0));
      updateCartBadge();
      setStatus(`${product.name} foi adicionado ao carrinho.`, "success");
      window.setTimeout(() => setStatus(""), 1800);
    });
  });
}

function applyFilters() {
  const query = String(searchElement?.value || "").trim().toLowerCase();
  const category = String(categoryElement?.value || "").trim().toLowerCase();

  const filtered = allProducts.filter((product) => {
    const haystack = `${product.name || ""} ${product.description || ""}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesCategory = !category || String(product.category || "").toLowerCase() === category;
    return matchesQuery && matchesCategory;
  });

  renderProducts(filtered);
}

async function init() {
  const user = await requireAuth({ redirectTo: "shop.html" });
  if (!user) return;
  updateCartBadge();
  setStatus("A carregar catalogo...", "neutral");

  try {
    allProducts = await fetchActiveProducts();
    renderProducts(allProducts);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel carregar os produtos.", "error");
  }
}

logoutButton?.addEventListener("click", async () => {
  setStatus("A terminar sessao...", "neutral");

  try {
    await logoutAndRedirect("login.html");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel terminar a sessao.", "error");
  }
});

searchElement?.addEventListener("input", applyFilters);
categoryElement?.addEventListener("change", applyFilters);
window.addEventListener("cart:updated", updateCartBadge);

init();
