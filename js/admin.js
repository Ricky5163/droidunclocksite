import { createSupabaseBrowserClient, escapeHtml } from "./app-config.js";
import { getCurrentUser, logoutAndRedirect } from "./auth-utils.js";
import { formatEuro, getEffectivePrice, getProductImage } from "./storefront.js";

const supabase = createSupabaseBrowserClient();
const statusElement = document.getElementById("adminStatus");
const form = document.getElementById("productForm");
const productsElement = document.getElementById("productsAdmin");
const ordersElement = document.getElementById("ordersAdmin");
const logoutButton = document.getElementById("logoutBtn");

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
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "login.html?next=admin.html";
    return false;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id,email,role")
    .eq("email", user.email)
    .maybeSingle();

  if (error || !data) {
    document.body.innerHTML = `<main class="result-page"><section class="result-card glass-card"><h1>Admin access required</h1><p class="muted">Your account is not listed in admin_users.</p><a class="btn btn--primary" href="index.html">Go home</a></section></main>`;
    return false;
  }
  return true;
}

function productPayload() {
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
    active: fields.active.checked,
  };
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
  fields.active.checked = Boolean(product.active);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  form.reset();
  fields.id.value = "";
  fields.active.checked = true;
}

async function loadProducts() {
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  productsElement.innerHTML = `
    <table>
      <thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Price</th><th></th></tr></thead>
      <tbody>
        ${(data || [])
          .map(
            (product) => `
              <tr>
                <td><div class="admin-product"><img src="${escapeHtml(getProductImage(product))}" alt="" /><strong>${escapeHtml(product.name)}</strong></div></td>
                <td>${escapeHtml(product.category || "")}</td>
                <td>${product.stock ?? 0}</td>
                <td>${formatEuro(getEffectivePrice(product))}</td>
                <td>
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
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  const statuses = ["Pending", "Paid", "Processing", "Shipped", "Completed", "Cancelled"];
  ordersElement.innerHTML = `
    <table>
      <thead><tr><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>
        ${(data || [])
          .map(
            (order) => `
              <tr>
                <td><strong>${escapeHtml(order.customer_name || "")}</strong><br /><span>${escapeHtml(order.customer_email || "")}</span></td>
                <td>${formatEuro(order.total_amount || 0)}</td>
                <td>${escapeHtml(order.payment_method || "")} · ${escapeHtml(order.payment_status || "")}</td>
                <td>
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
