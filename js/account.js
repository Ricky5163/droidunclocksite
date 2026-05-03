import { escapeHtml, formatEuro, getCartCount, setupAdminLogoShortcut } from "./app-config.js?v=auth8";
import { logoutAndRedirect, requireAuth, supabase } from "./auth-utils.js?v=auth8";

const statusElement = document.getElementById("accountStatus");
const nameElement = document.getElementById("accountName");
const emailElement = document.getElementById("accountEmail");
const initialsElement = document.getElementById("accountInitials");
const formElement = document.getElementById("profileForm");
const ordersListElement = document.getElementById("ordersList");
const orderDetailElement = document.getElementById("orderDetail");
const addressSummaryElement = document.getElementById("addressSummary");
const logoutButton = document.getElementById("logoutBtn");
const cartBadges = document.querySelectorAll("[data-cart-count]");

const fields = {
  name: document.getElementById("profileName"),
  email: document.getElementById("profileEmail"),
  phone: document.getElementById("profilePhone"),
  address: document.getElementById("profileAddress"),
  city: document.getElementById("profileCity"),
  postalCode: document.getElementById("profilePostalCode"),
  country: document.getElementById("profileCountry"),
};

let currentUser = null;
let currentProfile = null;
let orders = [];

setupAdminLogoShortcut();
updateCartBadge();

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function updateCartBadge() {
  cartBadges.forEach((badge) => {
    badge.textContent = `Carrinho (${getCartCount()})`;
  });
}

function orderDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function paymentLabel(value) {
  const method = String(value || "").toLowerCase();
  if (method === "stripe") return "Cartao";
  if (method === "paypal") return "PayPal";
  return value || "-";
}

function compactId(id) {
  return String(id || "").slice(0, 8).toUpperCase();
}

function statusClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("paid") || text.includes("completed") || text.includes("shipped")) return "is-good";
  if (text.includes("cancel") || text.includes("failed")) return "is-danger";
  return "is-pending";
}

function authNameFallback(user = currentUser) {
  return user?.email?.split("@")[0] || "Cliente";
}

function profileSelect() {
  return "user_id,full_name,phone,address,city,postal_code,country,created_at,updated_at";
}

async function loadProfile(user) {
  const { data, error } = await supabase
    .from("profiles")
    .select(profileSelect())
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const initialProfile = {
    user_id: user.id,
    full_name: authNameFallback(user),
  };

  const { data: createdProfile, error: createError } = await supabase
    .from("profiles")
    .upsert(initialProfile, { onConflict: "user_id" })
    .select(profileSelect())
    .single();

  if (createError) throw createError;
  return createdProfile;
}

function fillProfile(user, profile = currentProfile) {
  const fullName = profile?.full_name || authNameFallback(user);
  fields.name.value = fullName;
  fields.email.value = user.email || "";
  fields.phone.value = profile?.phone || "";
  fields.address.value = profile?.address || "";
  fields.city.value = profile?.city || "";
  fields.postalCode.value = profile?.postal_code || "";
  fields.country.value = profile?.country || "";

  nameElement.textContent = fullName;
  emailElement.textContent = user.email || "";
  initialsElement.textContent = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "DU";
}

function fillMissingProfileFromOrders() {
  const latest = orders.find((order) => order.customer_name || order.customer_phone || order.address || order.city || order.postal_code || order.country);
  if (!latest) return;

  if (!fields.name.value && latest.customer_name) fields.name.value = latest.customer_name;
  if (!fields.phone.value && latest.customer_phone) fields.phone.value = latest.customer_phone;
  if (!fields.address.value && latest.address) fields.address.value = latest.address;
  if (!fields.city.value && latest.city) fields.city.value = latest.city;
  if (!fields.postalCode.value && latest.postal_code) fields.postalCode.value = latest.postal_code;
  if (!fields.country.value && latest.country) fields.country.value = latest.country;
}

function getProfilePayload() {
  return {
    user_id: currentUser.id,
    full_name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    address: fields.address.value.trim(),
    city: fields.city.value.trim(),
    postal_code: fields.postalCode.value.trim(),
    country: fields.country.value.trim(),
  };
}

function addressBlock(source) {
  const rows = [
    ["Nome", source.customer_name || source.full_name || source.name],
    ["Telefone", source.customer_phone || source.phone],
    ["Morada", source.address],
    ["Cidade", source.city],
    ["Codigo postal", source.postal_code],
    ["Pais", source.country],
  ].filter(([, value]) => value);

  if (!rows.length) {
    return `<div class="empty-state"><h3>Nenhuma morada guardada</h3><p>Adiciona uma morada no separador Perfil.</p></div>`;
  }

  return `
    <dl class="detail-list">
      ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function renderAddressSummary() {
  const profile = {
    full_name: fields.name.value,
    phone: fields.phone.value,
    address: fields.address.value,
    city: fields.city.value,
    postal_code: fields.postalCode.value,
    country: fields.country.value,
  };
  const latestOrderWithAddress = orders.find((order) => order.address || order.city || order.postal_code || order.country);

  addressSummaryElement.innerHTML = `
    <section class="address-card">
      <h3>Morada principal</h3>
      ${addressBlock(profile)}
    </section>
    <section class="address-card">
      <h3>Ultima morada de encomenda</h3>
      ${latestOrderWithAddress ? addressBlock(latestOrderWithAddress) : `<p class="muted">Ainda nao existe uma morada usada numa encomenda.</p>`}
    </section>
  `;
}

async function loadOrders(user) {
  const baseSelect = `
    id,
    created_at,
    total_amount,
    payment_currency,
    payment_method,
    payment_status,
    order_status,
    customer_name,
    customer_email,
    customer_phone,
    country,
    address,
    postal_code,
    city,
    order_items (
      id,
      product_name,
      quantity,
      unit_price,
      total_price
    )
  `;
  const shippingSelect = `
    ${baseSelect},
    tracking_number,
    shipping_carrier,
    shipped_at
  `;

  let result = await supabase
    .from("orders")
    .select(shippingSelect)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (result.error && /tracking_number|shipping_carrier|shipped_at|column/i.test(result.error.message || "")) {
    result = await supabase
      .from("orders")
      .select(baseSelect)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
  }

  if (result.error) throw result.error;
  return result.data || [];
}

function renderOrders() {
  if (!orders.length) {
    ordersListElement.innerHTML = `
      <div class="empty-state empty-state--premium">
        <h3>Ainda nao ha encomendas</h3>
        <p>Quando comprares na Droidunclock, o historico aparece aqui.</p>
        <a class="btn btn--primary" href="shop.html">Continuar compras</a>
      </div>
    `;
    return;
  }

  ordersListElement.innerHTML = orders
    .map((order, index) => {
      const items = order.order_items || [];
      const productNames = items.map((item) => item.product_name).filter(Boolean).slice(0, 2).join(", ");
      return `
        <button class="order-card ${index === 0 ? "is-selected" : ""}" type="button" data-order-id="${escapeHtml(order.id)}">
          <div class="order-card__top">
            <div>
              <span class="eyebrow">#${escapeHtml(compactId(order.id))}</span>
              <strong>${escapeHtml(productNames || "Encomenda Droidunclock")}</strong>
              <small>${escapeHtml(orderDate(order.created_at))} - ${escapeHtml(paymentLabel(order.payment_method))}</small>
            </div>
            <strong>${formatEuro(order.total_amount)}</strong>
          </div>
          <div class="order-card__meta">
            <span class="status-pill ${statusClass(order.payment_status)}">${escapeHtml(order.payment_status || "pending")}</span>
            <span class="status-pill ${statusClass(order.order_status)}">${escapeHtml(order.order_status || "Pending")}</span>
            ${order.tracking_number ? `<span>${escapeHtml(order.shipping_carrier || "Tracking")} ${escapeHtml(order.tracking_number)}</span>` : ""}
            ${order.shipped_at ? `<span>Enviado ${escapeHtml(orderDate(order.shipped_at))}</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");

  ordersListElement.querySelectorAll("[data-order-id]").forEach((button) => {
    button.addEventListener("click", () => {
      ordersListElement.querySelectorAll(".order-card").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      renderOrderDetail(orders.find((order) => String(order.id) === button.dataset.orderId));
    });
  });

  renderOrderDetail(orders[0]);
}

function renderOrderDetail(order) {
  if (!order) return;
  const items = order.order_items || [];

  orderDetailElement.innerHTML = `
    <div class="order-detail__head">
      <span class="eyebrow">Detalhe</span>
      <h2>#${escapeHtml(compactId(order.id))}</h2>
      <p>${escapeHtml(orderDate(order.created_at))}</p>
    </div>

    <div class="order-status-grid">
      <section>
        <span>Pagamento</span>
        <strong>${escapeHtml(order.payment_status || "-")}</strong>
        <small>${escapeHtml(paymentLabel(order.payment_method))}</small>
      </section>
      <section>
        <span>Encomenda</span>
        <strong>${escapeHtml(order.order_status || "-")}</strong>
        <small>${escapeHtml(formatEuro(order.total_amount))}</small>
      </section>
      <section>
        <span>Envio</span>
        <strong>${escapeHtml(order.shipping_carrier || "A preparar")}</strong>
        <small>${escapeHtml(order.tracking_number || "Sem tracking ainda")}</small>
        ${order.shipped_at ? `<small>Enviado em ${escapeHtml(orderDate(order.shipped_at))}</small>` : ""}
      </section>
    </div>

    <section class="order-items">
      <h3>Produtos</h3>
      ${items.length ? items.map((item) => `
        <div class="order-item">
          <div>
            <strong>${escapeHtml(item.product_name)}</strong>
            <span>${Number(item.quantity || 0)} x ${formatEuro(item.unit_price)}</span>
          </div>
          <strong>${formatEuro(item.total_price)}</strong>
        </div>
      `).join("") : `<p class="muted">Sem produtos associados.</p>`}
    </section>

    <section class="order-address">
      <h3>Morada de envio usada</h3>
      ${addressBlock(order)}
    </section>
  `;
}

function setupTabs() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
      document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab));
    });
  });

  document.querySelector("[data-open-profile]")?.addEventListener("click", () => {
    document.querySelector('[data-tab="profile"]')?.click();
  });
}

formElement?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("A guardar dados...");
  formElement.querySelectorAll("button, input").forEach((element) => {
    element.disabled = true;
  });

  try {
    const payload = getProfilePayload();
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select(profileSelect())
      .single();

    if (error) throw error;
    currentProfile = data;
    fillProfile(currentUser, currentProfile);
    renderAddressSummary();
    setStatus("Dados guardados com sucesso.", "success");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel guardar os dados.", "error");
  } finally {
    formElement.querySelectorAll("button, input:not(#profileEmail)").forEach((element) => {
      element.disabled = false;
    });
  }
});

logoutButton?.addEventListener("click", async () => {
  setStatus("A terminar sessao...");
  try {
    await logoutAndRedirect("login.html");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel terminar sessao.", "error");
  }
});

(async function init() {
  setupTabs();
  currentUser = await requireAuth({ redirectTo: "account.html" });
  if (!currentUser) return;

  setStatus("A carregar perfil...");

  try {
    currentProfile = await loadProfile(currentUser);
    fillProfile(currentUser, currentProfile);
    setStatus("A carregar encomendas...");
    orders = await loadOrders(currentUser);
    fillMissingProfileFromOrders();
    renderOrders();
    renderAddressSummary();
    setStatus("");
  } catch (error) {
    ordersListElement.innerHTML = `<div class="empty-state"><h3>Nao foi possivel carregar encomendas</h3><p>${escapeHtml(error.message || "Tenta novamente mais tarde.")}</p></div>`;
    renderAddressSummary();
    setStatus("Erro ao carregar encomendas.", "error");
  }

  window.lucide?.createIcons();
})();
