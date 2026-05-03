import { buildLoginRedirect, escapeHtml, isValidEmail, setupAdminLogoShortcut } from "./app-config.js?v=auth8";
import { getAuthenticatedSession, hydrateUserEmail, rememberRedirectAfterLogin, syncAccountLinks } from "./auth-utils.js?v=auth8";
import { setupLanguageSelector } from "./i18n.js?v=lang2";
import {
  buildCartDetails,
  buildCheckoutPayload,
  fetchProductsByIds,
  formatEuro,
  getCart,
  syncCartToStock,
} from "./storefront.js?v=cart-fix2";

const SHIPPING_COST = 9.95;

const fields = {
  name: document.getElementById("customerName"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  country: document.getElementById("country"),
  address: document.getElementById("address"),
  postalCode: document.getElementById("postalCode"),
  city: document.getElementById("city"),
};

const formElement = document.getElementById("checkoutForm");
const statusElement = document.getElementById("status");
const summaryElement = document.getElementById("orderSummary");
const subtotalElement = document.getElementById("orderSubtotal");
const shippingElement = document.getElementById("orderShipping");
const totalElement = document.getElementById("orderTotal");
const stripeButton = document.getElementById("payStripe");
const paypalButton = document.getElementById("payPayPal");
const checkoutMainElement = document.getElementById("checkoutMain");
const checkoutGateElement = document.getElementById("checkoutGate");
const checkoutLoginLink = document.getElementById("checkoutLoginLink");

let orderLines = [];
let orderSubtotal = 0;
setupLanguageSelector();
setupAdminLogoShortcut();
syncAccountLinks().catch(() => null);

async function getCheckoutAccessToken() {
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) return null;
  return data?.session?.access_token || null;
}

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function setBusy(busy) {
  [stripeButton, paypalButton, ...Object.values(fields)].forEach((element) => {
    if (element) element.disabled = busy;
  });
}

function showCheckout() {
  checkoutMainElement?.classList.remove("hidden");
  checkoutGateElement?.classList.add("hidden");
}

function showLoginGate() {
  checkoutMainElement?.classList.add("hidden");
  checkoutGateElement?.classList.remove("hidden");
  rememberRedirectAfterLogin("checkout.html");
  if (checkoutLoginLink) checkoutLoginLink.href = buildLoginRedirect("checkout.html");
  setStatus("Sessao expirada ou nao autenticada. Inicia sessao para continuar.", "error");
}

function totals() {
  const shipping = orderLines.length ? SHIPPING_COST : 0;
  return { subtotal: orderSubtotal, shipping, total: orderSubtotal + shipping };
}

function renderSummary(lines, subtotal) {
  orderLines = lines;
  orderSubtotal = subtotal;
  if (!lines.length) {
    summaryElement.innerHTML = `<div class="empty-state"><h3>No items</h3><p>Your cart is empty or unavailable.</p><a class="btn btn--primary" href="shop.html">Back to shop</a></div>`;
    stripeButton.disabled = true;
    paypalButton.disabled = true;
  } else {
    summaryElement.innerHTML = lines
      .map(
        (line) => `
          <div class="checkout-line">
            <div><strong>${escapeHtml(line.name)}</strong><p>${line.qty} x ${formatEuro(line.price)}</p></div>
            <strong>${formatEuro(line.lineTotal)}</strong>
          </div>
        `,
      )
      .join("");
  }

  const next = totals();
  subtotalElement.textContent = formatEuro(next.subtotal);
  shippingElement.textContent = formatEuro(next.shipping);
  totalElement.textContent = formatEuro(next.total);
}

function getCustomer() {
  return {
    customer_name: fields.name.value.trim(),
    customer_email: fields.email.value.trim().toLowerCase(),
    customer_phone: fields.phone.value.trim(),
    country: fields.country.value.trim(),
    address: fields.address.value.trim(),
    postal_code: fields.postalCode.value.trim(),
    city: fields.city.value.trim(),
  };
}

function validateCustomer(customer) {
  if (!formElement.reportValidity()) return false;
  if (!isValidEmail(customer.customer_email)) {
    setStatus("Enter a valid email address.", "error");
    return false;
  }
  return true;
}

async function loadOrder() {
  const cart = getCart();
  if (!cart.length) {
    renderSummary([], 0);
    return;
  }
  setStatus("Validating cart...");
  const products = await fetchProductsByIds(cart.map((item) => item.id));
  syncCartToStock(products, cart);
  const details = buildCartDetails(products, getCart());
  renderSummary(details.lines, details.total);
  setStatus("");
}

async function startCheckout(endpoint, providerLabel) {
  const customer = getCustomer();
  if (!validateCustomer(customer)) return;
  if (!orderLines.length) {
    setStatus("No valid items for payment.", "error");
    return;
  }

  setBusy(true);
  setStatus(`Opening secure ${providerLabel} payment...`);

  try {
    const accessToken = await getCheckoutAccessToken();
    if (!accessToken) {
      localStorage.setItem("redirect_after_login", "checkout");
      setStatus("Sessao expirada. Faz login novamente.", "error");
      window.location.href = "login.html";
      return;
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...customer,
          cart: buildCheckoutPayload(orderLines),
        }),
      });
    } catch (networkError) {
      throw new Error(`Nao foi possivel contactar ${endpoint}. Verifica o dominio/CORS e tenta novamente.`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erro ${response.status} ao iniciar ${providerLabel}.`);

    const redirectUrl = data.url || data.approval_url || data.approvalUrl;
    if (!redirectUrl) throw new Error("Payment provider did not return a redirect URL.");
    window.location.href = redirectUrl;
  } catch (error) {
    setBusy(false);
    setStatus(error.message || "Payment error.", "error");
  }
}

stripeButton?.addEventListener("click", () => startCheckout("/api/create-checkout-session", "Stripe"));
paypalButton?.addEventListener("click", () => startCheckout("/api/paypal-create-order", "PayPal"));

(async function init() {
  const session = await getAuthenticatedSession({ wait: true, timeoutMs: 1200 }).catch(() => null);
  if (!session?.access_token) {
    showLoginGate();
    return;
  }
  showCheckout();
  await hydrateUserEmail(fields.email);
  try {
    await loadOrder();
  } catch (error) {
    setStatus(error.message || "Could not load checkout.", "error");
  }
})();
