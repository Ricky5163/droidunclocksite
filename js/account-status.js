import { buildLoginRedirect } from "./app-config.js?v=auth6";
import { getCurrentUser, logoutAndRedirect, onAuthStateChange } from "./auth-utils.js?v=auth6";

function currentPage() {
  return window.location.pathname.split("/").pop() || "shop.html";
}

function createAccountStatus() {
  const headerBar = document.querySelector(".site-header .header-bar");
  const nav = document.querySelector(".site-header .desktop-nav");
  const authCard = document.querySelector(".auth-card");
  const existing = document.querySelector("[data-account-status]");
  if (existing) return existing;

  const status = document.createElement("div");
  status.className = "account-status";
  status.dataset.accountStatus = "";
  status.innerHTML = `
    <span class="account-status__dot" aria-hidden="true"></span>
    <span class="account-status__copy">
      <strong data-account-label>Checking session</strong>
      <small data-account-email>Please wait...</small>
    </span>
    <button class="account-status__action" type="button" data-account-action>Entrar</button>
  `;

  if (headerBar) {
    headerBar.insertBefore(status, nav || null);
  } else if (authCard) {
    authCard.insertBefore(status, document.getElementById("status") || null);
  }

  return status;
}

function updateAccountStatus(status, user) {
  if (!status) return;

  const label = status.querySelector("[data-account-label]");
  const email = status.querySelector("[data-account-email]");
  const action = status.querySelector("[data-account-action]");
  const next = currentPage();

  action.replaceWith(action.cloneNode(true));
  const nextAction = status.querySelector("[data-account-action]");

  if (user?.email) {
    status.classList.add("is-authenticated");
    label.textContent = "Sessao iniciada";
    email.textContent = user.email;
    nextAction.textContent = "Sair";
    nextAction.addEventListener("click", () => logoutAndRedirect("login.html"));
    return;
  }

  status.classList.remove("is-authenticated");
  label.textContent = "Nao autenticado";
  email.textContent = "Entra para comprar e acompanhar encomendas";
  nextAction.textContent = "Entrar";
  nextAction.addEventListener("click", () => {
    window.location.href = buildLoginRedirect(next);
  });
}

async function initAccountStatus() {
  const status = createAccountStatus();
  if (!status) return;

  updateAccountStatus(status, await getCurrentUser({ wait: true, timeoutMs: 1200 }).catch(() => null));
  onAuthStateChange((user) => updateAccountStatus(status, user));
}

initAccountStatus();
