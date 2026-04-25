import {
  buildCartDetails,
  fetchProductsByIds,
  formatEuro,
  getCart,
  setCart,
  syncCartToStock,
} from "./storefront.js";

const cartListElement = document.getElementById("cartList");
const statusElement = document.getElementById("status");
const totalElement = document.getElementById("total");
const checkoutButton = document.getElementById("goCheckout");
const summaryCountElement = document.getElementById("summaryCount");

let currentLines = [];

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function updateSummary(lines, total) {
  totalElement.textContent = formatEuro(total);
  if (summaryCountElement) {
    const count = lines.reduce((sum, line) => sum + line.qty, 0);
    summaryCountElement.textContent = `${count} item${count === 1 ? "" : "s"}`;
  }

  checkoutButton.classList.toggle("hidden", !lines.length);
}

function updateQuantity(productId, nextQty) {
  const cart = getCart().map((item) => ({ ...item }));
  const index = cart.findIndex((item) => item.id === String(productId));
  if (index === -1) return;

  if (nextQty <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].qty = nextQty;
  }

  setCart(cart);
  render();
}

function renderLines(lines, total) {
  if (!lines.length) {
    cartListElement.innerHTML = `
      <div class="empty-state">
        <h3>O carrinho esta vazio</h3>
        <p>Escolhe um produto na loja para continuares para o checkout seguro.</p>
        <a class="btn btn--primary" href="shop.html">Voltar a loja</a>
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
            <img class="cart-line__image" src="${line.image_url || "assets/img_2.jpg"}" alt="${line.name}" />
            <div>
              <p class="eyebrow">${line.category || "Produto"}</p>
              <h3>${line.name}</h3>
              <p class="muted">${line.description || "Produto validado para venda e envio."}</p>
            </div>
          </div>
          <div class="cart-line__controls">
            <span class="availability ${line.available ? "availability--ok" : "availability--empty"}">
              ${line.available ? `${line.stock} em stock` : "Indisponivel"}
            </span>
            <div class="qty-control">
              <button type="button" data-dec="${line.id}" aria-label="Diminuir quantidade">-</button>
              <span>${line.qty}</span>
              <button type="button" data-inc="${line.id}" aria-label="Aumentar quantidade">+</button>
            </div>
            <strong>${formatEuro(line.lineTotal)}</strong>
            <button class="link-button" type="button" data-del="${line.id}">Remover</button>
          </div>
        </article>
      `
    )
    .join("");

  cartListElement.querySelectorAll("[data-dec]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-dec");
      const line = currentLines.find((item) => String(item.id) === id);
      if (!line) return;
      updateQuantity(id, line.qty - 1);
    });
  });

  cartListElement.querySelectorAll("[data-inc]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-inc");
      const line = currentLines.find((item) => String(item.id) === id);
      if (!line) return;
      updateQuantity(id, Math.min(line.qty + 1, line.stock));
    });
  });

  cartListElement.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", () => {
      updateQuantity(button.getAttribute("data-del"), 0);
    });
  });

  updateSummary(lines, total);
}

async function render() {
  const cart = getCart();
  if (!cart.length) {
    currentLines = [];
    renderLines([], 0);
    return;
  }

  setStatus("A sincronizar o carrinho com o stock...", "neutral");

  try {
    const products = await fetchProductsByIds(cart.map((item) => item.id));
    syncCartToStock(products, cart);

    const details = buildCartDetails(products, getCart());
    currentLines = details.lines;
    renderLines(details.lines, details.total);
    setStatus("");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel atualizar o carrinho.", "error");
  }
}

(async function init() {
  await render();
})();
