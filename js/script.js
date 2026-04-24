import { SITE_NAME, buildWhatsAppUrl } from "./app-config.js";
import { syncAccountLinks } from "./auth-utils.js";

const defaultMessage = [
  "Ola. Vim pelo site da Droidunclock e quero pedir um orcamento.",
  "",
  "Modelo:",
  "Problema:",
  "Observacoes:",
].join("\n");

function setWhatsAppLinks() {
  const url = buildWhatsAppUrl(defaultMessage);
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.href = url;
  });
}

function setupMenu() {
  const button = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");
  if (!button || !nav) return;

  button.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
    nav.setAttribute("aria-hidden", String(!isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      nav.setAttribute("aria-hidden", "true");
    });
  });
}

function setupQuickForm() {
  const form = document.getElementById("quickForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const model = String(data.get("modelo") || "").trim();
    const request = String(data.get("problema") || "").trim();
    const notes = String(data.get("obs") || "").trim();

    const message = [
      "Ola. Vim pelo site da Droidunclock.",
      "",
      `Modelo: ${model}`,
      `Pedido: ${request}`,
      `Observacoes: ${notes || "-"}`,
      "",
      "Obrigado.",
    ].join("\n");

    window.open(buildWhatsAppUrl(message), "_blank", "noopener");
  });
}

function setCurrentYear() {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
}

document.title = `${SITE_NAME} | Reparacao e Venda com Garantia`;
setWhatsAppLinks();
setupMenu();
setupQuickForm();
setCurrentYear();
syncAccountLinks();
