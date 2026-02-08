const cartList = document.getElementById("cartList");
const totalEl = document.getElementById("total");
const statusEl = document.getElementById("status");
const goCheckout = document.getElementById("goCheckout");

function euro(v){
  const n = Number(v || 0);
  return n.toLocaleString("pt-PT", { style:"currency", currency:"EUR" });
}

function getCart(){
  try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
}
function setCart(items){
  localStorage.setItem("cart", JSON.stringify(items));
}

function render(){
  const cart = getCart();
  if (!cart.length){
    cartList.innerHTML = `<p class="muted">O carrinho está vazio.</p>`;
    totalEl.textContent = euro(0);
    goCheckout.classList.add("hidden");
    return;
  }
  goCheckout.classList.remove("hidden");

  let total = 0;
  cartList.innerHTML = cart.map((it, idx) => {
    const line = Number(it.price) * Number(it.qty || 1);
    total += line;
    return `
      <div style="display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06);">
        <div>
          <strong>${it.name}</strong><br/>
          <span class="muted tiny">${euro(it.price)} • Qty:
            <button data-dec="${idx}" class="btn btn--ghost" style="padding:4px 10px;">-</button>
            <span style="display:inline-block; min-width:18px; text-align:center;">${it.qty}</span>
            <button data-inc="${idx}" class="btn btn--ghost" style="padding:4px 10px;">+</button>
          </span>
        </div>
        <div style="text-align:right;">
          <strong>${euro(line)}</strong><br/>
          <button data-del="${idx}" class="btn btn--ghost" style="padding:4px 10px; margin-top:6px;">Remover</button>
        </div>
      </div>
    `;
  }).join("");

  totalEl.textContent = euro(total);

  cartList.querySelectorAll("[data-inc]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.getAttribute("data-inc"));
    const c = getCart(); c[i].qty += 1; setCart(c); render();
  }));
  cartList.querySelectorAll("[data-dec]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.getAttribute("data-dec"));
    const c = getCart(); c[i].qty = Math.max(1, c[i].qty - 1); setCart(c); render();
  }));
  cartList.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
    const i = Number(b.getAttribute("data-del"));
    const c = getCart(); c.splice(i, 1); setCart(c); render();
  }));
}

render();
statusEl.textContent = "";
