import { isValidEmail } from "./app-config.js";
import { hydrateUserEmail, requireAuth } from "./auth-utils.js";
import {
  buildCartDetails,
  buildCheckoutPayload,
  fetchProductsByIds,
  formatEuro,
  getCart,
  syncCartToStock,
} from "./storefront.js";

const emailElement = document.getElementById("email");
const statusElement = document.getElementById("status");
const summaryElement = document.getElementById("orderSummary");
const totalElement = document.getElementById("orderTotal");
const stripeButton = document.getElementById("payStripe");
const paypalButton = document.getElementById("payPayPal");

let orderLines = [];

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function setBusy(busy) {
  [stripeButton, paypalButton, emailElement].forEach((element) => {
    if (element) element.disabled = busy;
  });
}

function renderSummary(lines, total) {
  if (!summaryElement || !totalElement) return;

  if (!lines.length) {
    summaryElement.innerHTML = `
      <div class="empty-state">
        <h3>Sem itens para pagar</h3>
        <p>O carrinho foi esvaziado ou os produtos ficaram indisponiveis.</p>
        <a class="btn btn--primary" href="shop.html">Voltar a loja</a>
      </div>
    `;
    totalElement.textContent = formatEuro(0);
    stripeButton.disabled = true;
    paypalButton.disabled = true;
    return;
  }

  summaryElement.innerHTML = lines
    .map(
      (line) => `
        <div class="checkout-line">
          <div>
            <strong>${line.name}</strong>
            <p class="muted">${line.qty} x ${formatEuro(line.price)}</p>
          </div>
          <strong>${formatEuro(line.lineTotal)}</strong>
        </div>
      `
    )
    .join("");

  totalElement.textContent = formatEuro(total);
}

async function loadOrder() {
  const cart = getCart();
  if (!cart.length) {
    renderSummary([], 0);
    return;
  }

  setStatus("A validar o carrinho...", "neutral");

  const products = await fetchProductsByIds(cart.map((item) => item.id));
  syncCartToStock(products, cart);

  const details = buildCartDetails(products, getCart());
  orderLines = details.lines;
  renderSummary(details.lines, details.total);
  setStatus("");
}

async function startCheckout(endpoint, providerLabel) {
  const email = String(emailElement.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    setStatus("Introduz um email valido para receberes a confirmacao.", "error");
    return;
  }

  if (!orderLines.length) {
    setStatus("Nao existem itens validos para pagamento.", "error");
    return;
  }

  setBusy(true);
  setStatus(`A abrir pagamento seguro com ${providerLabel}...`, "neutral");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        cart: buildCheckoutPayload(orderLines),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Nao foi possivel iniciar o pagamento.");
    }

    const redirectUrl = data.url || data.approval_url || data.approvalUrl;
    if (!redirectUrl) {
      throw new Error("Gateway de pagamento sem URL de redirecionamento.");
    }

    window.location.href = redirectUrl;
  } catch (error) {
    setBusy(false);
    setStatus(error.message || "Erro ao abrir pagamento.", "error");
  }
}

stripeButton?.addEventListener("click", () => {
  startCheckout("/api/create-checkout-session", "Stripe");
});

paypalButton?.addEventListener("click", () => {
  startCheckout("/api/paypal-create-order", "PayPal");
});

(async function init() {
  const user = await requireAuth({ redirectTo: "checkout.html" });
  if (!user) return;
  await hydrateUserEmail(emailElement);

  try {
    await loadOrder();
  } catch (error) {
    setStatus(error.message || "Nao foi possivel carregar o checkout.", "error");
  }
})();
