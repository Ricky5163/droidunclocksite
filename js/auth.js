const SUPABASE_URL = "https://eqklkfrxotoizpuacznc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxa2xrZnJ4b3RvaXpwdWFjem5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDAxMTAsImV4cCI6MjA4NTg3NjExMH0.Ex1LHdLN8Kfnu3ySY1JH7NUC9AM-TqXLnBiA56qE9Ow";

const statusEl = document.getElementById("status");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const logoutBtn = document.getElementById("logoutBtn");

const toggleSignupBtn = document.getElementById("toggleSignup");
const signupWrap = document.getElementById("signupWrap");

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
}

function showSignup(show) {
  if (!signupWrap || !toggleSignupBtn) return;
  signupWrap.classList.toggle("hidden", !show);
  toggleSignupBtn.setAttribute("aria-expanded", show ? "true" : "false");
}

toggleSignupBtn?.addEventListener("click", () => {
  const isHidden = signupWrap?.classList.contains("hidden");
  showSignup(isHidden);
});

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function refreshSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) return setStatus("❌ " + error.message);

  if (data?.session?.user) {
    setStatus("✅ Sessão ativa");
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    // Se já está logado, vai para a loja
    window.location.href = "shop.html";
  }
}

async function doLogin(email, password) {
  setStatus("A entrar...");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return setStatus("❌ " + error.message);

  setStatus("✅ Login efetuado!");
  setTimeout(() => (window.location.href = "shop.html"), 500);
}

async function doSignup(email, password) {
  setStatus("A criar conta...");
  const { error } = await sb.auth.signUp({ email, password });
  if (error) return setStatus("❌ " + error.message);

  setStatus("✅ Conta criada! Agora faz login.");
  showSignup(false);
}

async function doLogout() {
  setStatus("A terminar sessão...");
  const { error } = await sb.auth.signOut();
  if (error) return setStatus("❌ " + error.message);

  setStatus("Sessão terminada.");
  if (logoutBtn) logoutBtn.classList.add("hidden");
}

loginForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  doLogin(fd.get("email"), fd.get("password"));
});

signupForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(signupForm);
  doSignup(fd.get("email"), fd.get("password"));
});

logoutBtn?.addEventListener("click", doLogout);

refreshSession();