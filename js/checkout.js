import { buildLoginRedirect, escapeHtml, isValidEmail, setupAdminLogoShortcut } from "./app-config.js?v=auth10";
import { getAuthenticatedSession, hydrateUserEmail, rememberRedirectAfterLogin, syncAccountLinks } from "./auth-utils.js?v=auth10";
import { setupLanguageSelector } from "./i18n.js?v=lang2";
import {
  buildCartDetails,
  buildCheckoutPayload,
  fetchProductsByIds,
  formatEuro,
  getCart,
  syncCartToStock,
} from "./storefront.js?v=auth10";

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
let checkoutSession = null;
let isInitialLoading = true;
let isSubmitting = false;
let orderLoadError = "";
setupLanguageSelector();
setupAdminLogoShortcut();
syncAccountLinks().catch(() => null);

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function setPaymentButtonsDisabled(disabled) {
  [stripeButton, paypalButton].forEach((button) => {
    if (button) button.disabled = disabled;
  });
}

function setBusy(busy) {
  isSubmitting = busy;
  [...Object.values(fields)].forEach((element) => {
    if (element) element.disabled = busy;
  });
  updatePaymentAvailability();
}

function showCheckout() {
  checkoutMainElement?.classList.remove("hidden");
  checkoutGateElement?.classList.add("hidden");
}

function showLoginGate() {
  checkoutSession = null;
  checkoutMainElement?.classList.add("hidden");
  checkoutGateElement?.classList.remove("hidden");
  rememberRedirectAfterLogin("checkout.html");
  if (checkoutLoginLink) checkoutLoginLink.href = buildLoginRedirect("checkout.html");
  setStatus("Sessao expirada ou nao autenticada. Inicia sessao para continuar.", "error");
  updatePaymentAvailability();
}

function totals() {
  const shipping = orderLines.length ? SHIPPING_COST : 0;
  return { subtotal: orderSubtotal, shipping, total: orderSubtotal + shipping };
}

function renderSummary(lines, subtotal) {
  orderLoadError = "";
  orderLines = lines;
  orderSubtotal = subtotal;
  if (!lines.length) {
    summaryElement.innerHTML = `<div class="empty-state"><h3>No items</h3><p>Your cart is empty or unavailable.</p><a class="btn btn--primary" href="shop.html">Back to shop</a></div>`;
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
  updatePaymentAvailability({ showMessage: true });
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

function getCheckoutBlocker() {
  if (!checkoutSession?.access_token) {
    return { message: "Sessao expirada. Faz login novamente.", type: "error" };
  }

  if (orderLoadError) {
    return { message: orderLoadError, type: "error" };
  }

  if (!orderLines.length) {
    return { message: "Carrinho vazio.", type: "error" };
  }

  const requiredFields = [
    [fields.name, "nome completo"],
    [fields.email, "email"],
    [fields.phone, "telefone"],
    [fields.country, "pais"],
    [fields.city, "cidade"],
    [fields.address, "morada"],
    [fields.postalCode, "codigo postal"],
  ];
  const missing = requiredFields.find(([field]) => !field?.value.trim());
  if (missing) {
    return { message: `Preenche o campo obrigatorio: ${missing[1]}.`, type: "neutral" };
  }

  if (!isValidEmail(fields.email.value.trim())) {
    return { message: "Introduz um email valido.", type: "error" };
  }

  return null;
}

function updatePaymentAvailability(options = {}) {
  const blocker = getCheckoutBlocker();
  const disabled = isInitialLoading || isSubmitting || Boolean(blocker);
  setPaymentButtonsDisabled(disabled);

  if (options.showMessage && !isInitialLoading && !isSubmitting) {
    setStatus(blocker?.message || "", blocker?.type || "neutral");
  }

  return !disabled;
}

async function getFreshCheckoutSession() {
  const refreshed = await window.supabaseClient.auth.refreshSession().catch((error) => {
    console.warn("[checkout auth refresh]", { errorMessage: error?.message || "Refresh failed" });
    return null;
  });

  if (refreshed?.data?.session?.access_token) {
    return refreshed.data.session;
  }

  const { data: { session } = {} } = await window.supabaseClient.auth.getSession();
  return session || null;
}

async function readCheckoutResponse(response, providerLabel, endpoint) {
  const rawBody = await response.text().catch(() => "");
  let body = {};

  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { error: rawBody.slice(0, 500) };
    }
  }

  console.log("[checkout response]", {
    provider: providerLabel,
    endpoint,
    status: response.status,
    ok: response.ok,
    body,
  });

  return body;
}

function getPaymentRedirectUrl(data) {
  return data?.url || data?.sessionUrl || data?.session_url || data?.approvalUrl || data?.approval_url || data?.approveUrl;
}

async function loadOrder() {
  orderLoadError = "";
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
  if (!updatePaymentAvailability({ showMessage: true })) return;

  const customer = getCustomer();
  if (!validateCustomer(customer)) return;
  if (!orderLines.length) {
    setStatus("Carrinho vazio.", "error");
    return;
  }

  setBusy(true);
  setStatus(`Opening secure ${providerLabel} payment...`);

  try {
    const session = await getFreshCheckoutSession();
    console.log("[checkout auth]", {
      hasClient: !!window.supabaseClient,
      hasSession: !!session,
      hasToken: !!session?.access_token,
      userId: session?.user?.id || null,
    });

    if (!session?.access_token) {
      checkoutSession = null;
      rememberRedirectAfterLogin("checkout.html");
      setStatus("Sessao expirada. Faz login novamente.", "error");
      window.location.href = "login.html";
      return;
    }

    checkoutSession = session;
    const accessToken = session.access_token;

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

    const data = await readCheckoutResponse(response, providerLabel, endpoint);
    if (!response.ok) {
      throw new Error(data.error || `Erro ${response.status} ao iniciar ${providerLabel}.`);
    }

    const redirectUrl = getPaymentRedirectUrl(data);
    if (!redirectUrl) {
      throw new Error(`${providerLabel} nao devolveu URL de pagamento.`);
    }
    window.location.href = redirectUrl;
  } catch (error) {
    console.warn("[checkout error]", {
      provider: providerLabel,
      endpoint,
      errorMessage: error?.message || "Payment error.",
    });
    setBusy(false);
    updatePaymentAvailability();
    setStatus(error.message || "Payment error.", "error");
  }
}

stripeButton?.addEventListener("click", () => startCheckout("/api/create-checkout-session", "Stripe"));
paypalButton?.addEventListener("click", () => startCheckout("/api/paypal-create-order", "PayPal"));
Object.values(fields).forEach((field) => {
  field?.addEventListener("input", () => updatePaymentAvailability({ showMessage: true }));
  field?.addEventListener("change", () => updatePaymentAvailability({ showMessage: true }));
});

(async function init() {
  setPaymentButtonsDisabled(true);
  setStatus("A carregar checkout...");
  const session = await getAuthenticatedSession({ wait: true, timeoutMs: 1200 }).catch(() => null);
  if (!session?.access_token) {
    isInitialLoading = false;
    showLoginGate();
    return;
  }
  checkoutSession = session;
  showCheckout();
  await hydrateUserEmail(fields.email);
  try {
    await loadOrder();
  } catch (error) {
    orderLoadError = error.message || "Could not load checkout.";
    setStatus(orderLoadError, "error");
  } finally {
    isInitialLoading = false;
    updatePaymentAvailability({ showMessage: true });
  }
})();
