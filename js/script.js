// ====== CONFIG ======
const WHATSAPP_NUMBER = "351965782553";

// Supabase (igual ao teu projeto)
const SUPABASE_URL = "https://eqklkfrxotoizpuacznc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa2xrZnJ4b3RvaXpwdWFjem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDAxMTAsImV4cCI6MjA4NTg3NjExMH0.Ex1LHdLN8Kfnu3ySY1JH7NUC9AM-TqXLnBiA56qE9Ow";

function waLink(message) {
  const text = encodeURIComponent(message);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

// Top CTA / Contact / Floating
const defaultMsg =
  "Olá! Vim pelo site da Droidunclock. Quero um orçamento.\n\n" +
  "Modelo: \nProblema: \nObservações: \n";

function setWhatsAppLinks() {
  const cta = document.getElementById("ctaWhatsApp");
  const contact = document.getElementById("contactWhatsApp");
  const floatBtn = document.getElementById("waFloat");

  const link = waLink(defaultMsg);
  if (cta) cta.href = link;
  if (contact) contact.href = link;
  if (floatBtn) floatBtn.href = link;
}
setWhatsAppLinks();

// Mobile menu
const menuBtn = document.getElementById("menuBtn");
const mobileNav = document.getElementById("mobileNav");

if (menuBtn && mobileNav) {
  menuBtn.addEventListener("click", () => {
    mobileNav.classList.toggle("show");
    mobileNav.setAttribute(
      "aria-hidden",
      mobileNav.classList.contains("show") ? "false" : "true"
    );
  });

  mobileNav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => mobileNav.classList.remove("show"));
  });
}

// Quick form -> WhatsApp
const form = document.getElementById("quickForm");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const modelo = (data.get("modelo") || "").toString().trim();
    const problema = (data.get("problema") || "").toString().trim();
    const obs = (data.get("obs") || "").toString().trim();

    const msg =
      "Olá! Vim pelo site da Droidunclock.\n\n" +
      `Modelo: ${modelo}\n` +
      `Pedido: ${problema}\n` +
      `Observações: ${obs || "—"}\n\n` +
      "Obrigado!";

    window.open(waLink(msg), "_blank");
  });
}

// Year
const y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();

// ====== Account link (Login/Loja) ======
async function updateAccountLink() {
  const link = document.getElementById("accountLink");
  if (!link) return;

  if (!window.supabase) {
    // Se não carregar o SDK, fica "Entrar"
    link.href = "login.html";
    link.textContent = "Entrar";
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await sb.auth.getSession();

  if (data?.session?.user) {
    link.href = "shop.html";
    link.textContent = "Minha Loja";
  } else {
    link.href = "login.html";
    link.textContent = "Entrar";
  }
}
updateAccountLink();