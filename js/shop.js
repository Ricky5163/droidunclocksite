// ====== CONFIG SUPABASE ======
const SUPABASE_URL = "https://eqklkfrxotoizpuacznc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa2xrZnJ4b3RvaXpwdWFjem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDAxMTAsImV4cCI6MjA4NTg3NjExMH0.Ex1LHdLN8Kfnu3ySY1JH7NUC9AM-TqXLnBiA56qE9Ow";

const statusEl = document.getElementById("status");
const gridEl = document.getElementById("grid");
const searchEl = document.getElementById("search");
const categoryEl = document.getElementById("category");
const logoutBtn = document.getElementById("logoutBtn");
const cartBtn = document.getElementById("cartBtn");

function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ""; }

function euro(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

function getCart() {
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
}
function setCart(items) {
  localStorage.setItem("cart", JSON.stringify(items));
  updateCartBadge();
}
function updateCartBadge() {
  const cart = getCart();
  const totalQty = cart.reduce((s, it) => s + (it.qty || 0), 0);
  if (cartBtn) cartBtn.textContent = `Carrinho (${totalQty})`;
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function requireAuth() {
  const { data, error } = await sb.auth.getSession();
  if (error) return setStatus("❌ Erro sessão: " + error.message);
  if (!data?.session?.user) window.location.href = "login.html";
}

function productCard(p) {
  const img = p.image_url || "assets/img_2.jpg";
  const stock = Number(p.stock ?? 0);
  const stockTxt = stock > 0 ? `Stock: ${stock}` : "Sem stock";
  const disabled = stock <= 0 ? "disabled" : "";

  return `
    <article class="productCard">
      <img class="productImg" src="${img}" alt="${escapeHtml(p.name)}" />
      <div class="productBody">
        <div class="productTop">
          <h3 class="productName">${escapeHtml(p.name)}</h3>
          <div class="productPrice">${euro(p.price)}</div>
        </div>

        <div class="productMeta">
          <span class="pill">${escapeHtml(p.category || "produto")}</span>
          <span class="muted tiny">${stockTxt}</span>
        </div>

        <p class="productDesc muted">${escapeHtml(p.description || "")}</p>

        <button class="btn btn--block" data-add="${p.id}" ${disabled}>
          Adicionar ao carrinho
        </button>
      </div>
    </article>
  `;
}

let allProducts = [];

function render(list) {
  if (!gridEl) return;
  if (!list.length) {
    gridEl.innerHTML = `<p class="muted">Sem produtos para mostrar.</p>`;
    return;
  }
  gridEl.innerHTML = list.map(productCard).join("");

  gridEl.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => addToCart(btn.getAttribute("data-add")));
  });
}

function applyFilters() {
  const q = (searchEl?.value || "").trim().toLowerCase();
  const cat = categoryEl?.value || "";

  const filtered = allProducts.filter(p => {
    const hay = `${p.name || ""} ${p.description || ""}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okCat = !cat || (p.category || "") === cat;
    return okQ && okCat;
  });

  render(filtered);
}

async function loadProducts() {
  setStatus("A carregar produtos...");
  const { data, error } = await sb
    .from("products")
    .select("id,name,price,description,image_url,category,stock,active,created_at")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) return setStatus("❌ " + error.message);

  allProducts = data || [];
  setStatus("");
  applyFilters();
}

function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const cart = getCart();
  const idx = cart.findIndex(x => x.id === productId);

  if (idx >= 0) cart[idx].qty += 1;
  else cart.push({
    id: p.id,
    name: p.name,
    price: p.price,
    qty: 1,
    image_url: p.image_url || ""
  });

  setCart(cart);
  setStatus(`✅ Adicionado: ${p.name}`);
  setTimeout(() => setStatus(""), 1200);
}

async function logout() {
  setStatus("A terminar sessão...");
  const { error } = await sb.auth.signOut();
  if (error) return setStatus("❌ " + error.message);
  window.location.href = "login.html";
}

logoutBtn?.addEventListener("click", logout);
searchEl?.addEventListener("input", applyFilters);
categoryEl?.addEventListener("change", applyFilters);

(async function init() {
  updateCartBadge();
  await requireAuth();
  await loadProducts();
})();

