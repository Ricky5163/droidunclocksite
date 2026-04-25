import { getAuthenticatedRedirectTarget, logoutAndRedirect, redirectIfAuthenticated, supabase, waitForSession } from "./auth-utils.js?v=auth4";

const statusElement = document.getElementById("status");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const toggleSignupButton = document.getElementById("toggleSignup");
const signupWrap = document.getElementById("signupWrap");
const logoutButton = document.getElementById("logoutBtn");
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");

function setStatus(message, type = "neutral") {
  if (!statusElement) return;
  statusElement.textContent = message || "";
  statusElement.dataset.state = type;
}

function setBusy(form, busy) {
  if (!form) return;
  form.querySelectorAll("button, input").forEach((element) => {
    element.disabled = busy;
  });
}

function showSignup(show) {
  if (!signupWrap || !toggleSignupButton) return;
  signupWrap.classList.toggle("hidden", !show);
  toggleSignupButton.setAttribute("aria-expanded", String(show));
}

toggleSignupButton?.addEventListener("click", () => {
  showSignup(signupWrap?.classList.contains("hidden"));
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(loginForm, true);
  setStatus("A validar credenciais...", "neutral");

  const data = new FormData(loginForm);
  const email = String(loginEmailInput?.value || data.get("email") || "").trim().toLowerCase();
  const password = String(loginPasswordInput?.value || data.get("password") || "");

  if (!email) {
    setBusy(loginForm, false);
    setStatus("Introduz o email antes de entrar.", "error");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setBusy(loginForm, false);

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus("Sessao iniciada com sucesso. A redirecionar...", "success");
  const session = await waitForSession();
  window.location.href = await getAuthenticatedRedirectTarget(session?.user);
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(signupForm, true);
  setStatus("A criar conta segura...", "neutral");

  const data = new FormData(signupForm);
  const email = String(signupEmailInput?.value || data.get("email") || "").trim().toLowerCase();
  const password = String(signupPasswordInput?.value || data.get("password") || "");

  if (!email) {
    setBusy(signupForm, false);
    setStatus("Introduz o email para criar a conta.", "error");
    return;
  }

  if (password.length < 8) {
    setBusy(signupForm, false);
    setStatus("Usa uma palavra-passe com pelo menos 8 caracteres.", "error");
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  setBusy(signupForm, false);

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  setStatus("Conta criada. Confirma o email se a verificacao estiver ativa.", "success");
  showSignup(false);
});

logoutButton?.addEventListener("click", async () => {
  setStatus("A terminar sessao...", "neutral");

  try {
    await logoutAndRedirect("login.html");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel terminar a sessao.", "error");
  }
});

redirectIfAuthenticated().catch((error) => {
  setStatus(error.message || "Erro ao validar a sessao.", "error");
});
