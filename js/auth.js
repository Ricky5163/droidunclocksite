import { buildAuthEmailRedirect } from "./app-config.js?v=auth8";
import {
  getAuthenticatedSession,
  getAuthenticatedRedirectTarget,
  logoutAndRedirect,
  peekRedirectAfterLogin,
  redirectIfAuthenticated,
  supabase,
  waitForSession,
} from "./auth-utils.js?v=auth8";

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
const signupButton = signupForm?.querySelector("button[type='submit']");
let signupCooldownTimer;

function hasAuthCallbackParams() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.has("code") || hash.has("access_token") || hash.has("refresh_token") || hash.get("type") === "signup";
}

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

function friendlyAuthError(error) {
  const message = String(error?.message || error || "");
  if (/rate limit|email rate/i.test(message)) {
    return "Foram pedidos demasiados emails de confirmacao em pouco tempo. Espera alguns minutos e verifica o email/spam antes de tentar outra vez.";
  }
  if (/already registered|already exists|user already/i.test(message)) {
    return "Este email ja tem uma conta. Tenta entrar ou confirma o email que recebeste.";
  }
  return message || "Nao foi possivel concluir a autenticacao.";
}

function startSignupCooldown(seconds = 60) {
  if (!signupButton) return;
  window.clearInterval(signupCooldownTimer);

  let remaining = seconds;
  const originalText = signupButton.textContent;
  signupButton.disabled = true;
  signupButton.textContent = `Aguarda ${remaining}s`;

  signupCooldownTimer = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      signupButton.textContent = `Aguarda ${remaining}s`;
      return;
    }

    window.clearInterval(signupCooldownTimer);
    signupButton.disabled = false;
    signupButton.textContent = originalText;
  }, 1000);
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

  const formData = new FormData(loginForm);
  const email = String(loginEmailInput?.value || formData.get("email") || "").trim().toLowerCase();
  const password = String(loginPasswordInput?.value || formData.get("password") || "");

  if (!email) {
    setBusy(loginForm, false);
    setStatus("Introduz o email antes de entrar.", "error");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  setBusy(loginForm, false);

  if (error) {
    setStatus(friendlyAuthError(error), "error");
    return;
  }

  const session = data?.session || (await waitForSession());
  if (!session?.access_token) {
    setStatus("Sessao expirada ou nao autenticada. Inicia sessao para continuar.", "error");
    return;
  }

  setStatus("Sessao iniciada com sucesso. A redirecionar...", "success");
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

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildAuthEmailRedirect(peekRedirectAfterLogin("shop.html")),
    },
  });
  setBusy(signupForm, false);

  if (error) {
    setStatus(friendlyAuthError(error), "error");
    if (/rate limit|email rate/i.test(String(error.message || ""))) {
      startSignupCooldown(60);
    }
    return;
  }

  setStatus("Conta criada. Abre o email de confirmacao e clica no link para ativar a conta. Nao cries outra conta com o mesmo email.", "success");
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

const hasAuthCallback = hasAuthCallbackParams();
if (hasAuthCallback) {
  setStatus("A validar email e a iniciar sessao...", "neutral");
}

const redirectPromise = redirectIfAuthenticated({ timeoutMs: hasAuthCallback ? 5000 : 800 }).catch((error) => {
  setStatus(error.message || "Erro ao validar a sessao.", "error");
  return null;
});

if (hasAuthCallback) {
  redirectPromise.then(async (user) => {
    if (user) return;
    const session = await getAuthenticatedSession({ wait: true, timeoutMs: 1400 });
    if (session?.access_token && session.user) {
      window.location.href = await getAuthenticatedRedirectTarget(session.user);
      return;
    }
    setStatus("Email confirmado. Inicia sessao para continuar o checkout.", "success");
  });
}
