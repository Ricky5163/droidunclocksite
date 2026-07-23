import { buildAdminLoginRedirect, escapeHtml, setupAdminLogoShortcut } from "./app-config.js?v=auth10";
import { getCurrentUser, getSession, logoutAndRedirect } from "./auth-utils.js?v=auth10";
import { setupLanguageSelector } from "./i18n.js?v=lang2";
import { formatEuro, getEffectivePrice, getProductImage } from "./storefront.js?v=auth10";

const supabase = window.supabaseClient;
const statusElement = document.getElementById("adminStatus");
const form = document.getElementById("productForm");
const productsElement = document.getElementById("productsAdmin");
const ordersElement = document.getElementById("ordersAdmin");
const logoutButton = document.getElementById("logoutBtn");
setupLanguageSelector();
setupAdminLogoShortcut();

const fields = {
  id: document.getElementById("productId"),
  name: document.getElementById("name"),
  brand: document.getElementById("brand"),
  model: document.getElementById("model"),
  category: document.getElementById("category"),
  condition: document.getElementById("condition"),
  description: document.getElementById("description"),
  images: document.getElementById("images"),
  price: document.getElementById("price"),
  discountPrice: document.getElementById("discountPrice"),
  stock: document.getElementById("stock"),
  technicalDetails: document.getElementById("technicalDetails"),
  warrantyInfo: document.getElementById("warrantyInfo"),
  deliveryInfo: document.getElementById("deliveryInfo"),
  publishAt: document.getElementById("publishAt"),
  active: document.getElementById("active"),
};

function setStatus(message, type = "neutral") {
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function assertAdmin() {
  const user = await getCurrentUser({ wait: true });
  if (!user) {
    window.location.href = buildAdminLoginRedirect();
    return false;
  }

  let data;
  let error;

  try {
    const response = await supabase
      .from("admin_users")
      .select("id,email,role")
      .eq("email", user.email)
      .maybeSingle();

    data = response.data;
    error = response.error;
  } catch (requestError) {
    error = requestError;
  }

  if (error || !data) {
    document.body.innerHTML = `<main class="result-page"><section class="result-card glass-card"><h1>Admin access required</h1><p class="muted">Your account is not listed in admin_users.</p><a class="btn btn--primary" href="${buildAdminLoginRedirect()}">Login as admin</a></section></main>`;
    return false;
  }
  return true;
}

function productPayload() {
  const publishAt = fields.publishAt.value
    ? new Date(`${fields.publishAt.value}T00:00:00`).toISOString()
    : null;

  return {
    name: fields.name.value.trim(),
    slug: slugify(`${fields.name.value}-${fields.model.value}`),
    brand: fields.brand.value.trim(),
    model: fields.model.value.trim(),
    category: fields.category.value,
    condition: fields.condition.value,
    description: fields.description.value.trim(),
    price: Number(fields.price.value || 0),
    discount_price: fields.discountPrice.value ? Number(fields.discountPrice.value) : null,
    stock: Number(fields.stock.value || 0),
    images: fields.images.value.split(/\n|,/).map((url) => url.trim()).filter(Boolean),
    technical_details: fields.technicalDetails.value.trim(),
    warranty_info: fields.warrantyInfo.value.trim(),
    delivery_info: fields.deliveryInfo.value.trim(),
    publish_at: publishAt,
    active: fields.active.checked,
  };
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fillForm(product) {
  fields.id.value = product.id;
  fields.name.value = product.name || "";
  fields.brand.value = product.brand || "";
  fields.model.value = product.model || "";
  fields.category.value = product.category || "Refurbished Phones";
  fields.condition.value = product.condition || "New";
  fields.description.value = product.description || "";
  fields.images.value = Array.isArray(product.images) ? product.images.join("\n") : "";
  fields.price.value = product.price || 0;
  fields.discountPrice.value = product.discount_price || "";
  fields.stock.value = product.stock || 0;
  fields.technicalDetails.value = product.technical_details || "";
  fields.warrantyInfo.value = product.warranty_info || "";
  fields.deliveryInfo.value = product.delivery_info || "";
  fields.publishAt.value = dateInputValue(product.publish_at);
  fields.active.checked = Boolean(product.active);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  fields.active.checked = true;
}

function productStatus(product) {
  const stock = Math.max(0, Number(product.stock ?? 0));
  if (stock <= 0 || !product.active) {
    return `<span class="status-pill status-pill--sold">Sold</span>`;
  }

  if (product.publish_at && new Date(product.publish_at) > new Date()) {
    return `<span class="status-pill status-pill--scheduled">Scheduled</span>`;
  }

  return `<span class="status-pill status-pill--live">Live</span>`;
}

async function loadProducts() {
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  productsElement.innerHTML = `
    <table>
      <thead><tr><th>Product</th><th>Category</th><th>Status</th><th>Go live</th><th>Stock</th><th>Price</th><th></th></tr></thead>
      <tbody>
        ${(data || [])
          .map(
            (product) => `
              <tr>
                <td data-label="Product"><div class="admin-product"><img src="${escapeHtml(getProductImage(product))}" alt="" /><strong>${escapeHtml(product.name)}</strong></div></td>
                <td data-label="Category">${escapeHtml(product.category || "")}</td>
                <td data-label="Status">${productStatus(product)}</td>
                <td data-label="Go live">${product.publish_at ? escapeHtml(dateInputValue(product.publish_at)) : "Now"}</td>
                <td data-label="Stock">${product.stock ?? 0}</td>
                <td data-label="Price">${formatEuro(getEffectivePrice(product))}</td>
                <td data-label="Actions">
                  <button class="link-button" data-edit="${product.id}">Edit</button>
                  <button class="link-button" data-delete="${product.id}">Delete</button>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  productsElement.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => fillForm(data.find((product) => String(product.id) === button.dataset.edit)));
  });

  productsElement.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { error } = await supabase.from("products").delete().eq("id", button.dataset.delete);
      if (error) setStatus(error.message, "error");
      else {
        setStatus("Product deleted.", "success");
        await loadProducts();
      }
    });
  });
}

async function loadOrders() {
  const session = await getSession();
  const response = await fetch("/api/admin-orders", {
    headers: {
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not load orders.");

  const data = payload.orders || [];
  const statuses = ["Pending", "Paid", "Processing", "Shipped", "Completed", "Cancelled"];
  ordersElement.innerHTML = `
    <table>
      <thead><tr><th>Customer</th><th>Delivery</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>
        ${(data || [])
          .map(
            (order) => `
              <tr>
                <td data-label="Customer">
                  <strong>${escapeHtml(order.customer_name || "")}</strong><br />
                  <span>${escapeHtml(order.customer_email || "")}</span><br />
                  <span>${escapeHtml(order.customer_phone || "")}</span>
                </td>
                <td data-label="Delivery">
                  <strong>${escapeHtml(order.address || "")}</strong><br />
                  <span>${escapeHtml([order.postal_code, order.city].filter(Boolean).join(" "))}</span><br />
                  <span>${escapeHtml(order.country || "")}</span>
                  <div class="admin-tracking">
                    <label>Carrier<input value="${escapeHtml(order.shipping_carrier || "")}" data-tracking-carrier="${order.id}" placeholder="DHL, PostNL, UPS" /></label>
                    <label>Tracking<input value="${escapeHtml(order.tracking_number || "")}" data-tracking-number="${order.id}" placeholder="Tracking number" /></label>
                    <label>Tracking URL<input value="${escapeHtml(order.tracking_url || "")}" data-tracking-url="${order.id}" placeholder="https://..." /></label>
                    <button class="link-button" type="button" data-save-tracking="${order.id}">Save tracking</button>
                  </div>
                </td>
                <td data-label="Items">${orderItemsSummary(order.items)}</td>
                <td data-label="Total">${formatEuro(order.total_amount || 0)}</td>
                <td data-label="Payment">${escapeHtml(order.payment_method || "")} / ${escapeHtml(order.payment_status || "")}</td>
                <td data-label="Status">
                  <select data-order-status="${order.id}">
                    ${statuses.map((status) => `<option ${status === order.order_status ? "selected" : ""}>${status}</option>`).join("")}
                  </select>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;

  ordersElement.querySelectorAll("[data-order-status]").forEach((select) => {
    select.addEventListener("change", async () => {
      const { error } = await supabase.from("orders").update({ order_status: select.value }).eq("id", select.dataset.orderStatus);
      setStatus(error ? error.message : "Order status updated.", error ? "error" : "success");
    });
  });

  ordersElement.querySelectorAll("[data-save-tracking]").forEach((button) => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.saveTracking;
      const order = data.find((entry) => String(entry.id) === String(orderId));
      const carrier = ordersElement.querySelector(`[data-tracking-carrier="${CSS.escape(orderId)}"]`)?.value.trim() || null;
      const trackingNumber = ordersElement.querySelector(`[data-tracking-number="${CSS.escape(orderId)}"]`)?.value.trim() || null;
      const trackingUrl = ordersElement.querySelector(`[data-tracking-url="${CSS.escape(orderId)}"]`)?.value.trim() || null;
      const payload = {
        shipping_carrier: carrier,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        shipped_at: trackingNumber && !order?.shipped_at ? new Date().toISOString() : order?.shipped_at || null,
        order_status: trackingNumber && order?.order_status === "Paid" ? "Shipped" : order?.order_status || "Paid",
      };

      const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
      if (error) {
        setStatus(error.message, "error");
        return;
      }

      setStatus("Tracking updated.", "success");
      await loadOrders();
    });
  });
}

function orderItemsSummary(items = []) {
  if (!items.length) return `<span>No items</span>`;

  return items
    .map(
      (item) => `
        <div class="admin-order-item">
          <strong>${escapeHtml(item.product_name || "")}</strong>
          <span>${Number(item.quantity || 0)} x ${formatEuro(item.unit_price || 0)}</span>
        </div>
      `,
    )
    .join("");
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("Saving product...");
  const payload = productPayload();
  const request = fields.id.value
    ? supabase.from("products").update(payload).eq("id", fields.id.value)
    : supabase.from("products").insert([payload]);
  const { error } = await request;
  if (error) setStatus(error.message, "error");
  else {
    setStatus("Product saved.", "success");
    resetForm();
    await loadProducts();
  }
});

document.getElementById("resetForm")?.addEventListener("click", resetForm);
logoutButton?.addEventListener("click", () => logoutAndRedirect("login.html"));

(async function init() {
  if (!(await assertAdmin())) return;
  try {
    await Promise.all([loadProducts(), loadOrders()]);
  } catch (error) {
    setStatus(error.message || "Could not load admin data.", "error");
  }
})();
