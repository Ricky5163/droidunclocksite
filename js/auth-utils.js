import {
  DEFAULT_LOGIN_REDIRECT,
  buildLoginRedirect,
  getPostLoginTarget,
  sanitizeReturnPath,
} from "./app-config.js?v=auth9";

const supabase = window.supabaseClient;
const SESSION_WAIT_TIMEOUT = 3000;
const SESSION_WAIT_INTERVAL = 100;
const REDIRECT_AFTER_LOGIN_KEY = "redirect_after_login";
const REDIRECT_ALIASES = {
  checkout: "checkout.html",
  cart: "cart.html",
  account: "account.html",
  shop: "shop.html",
};
let accountLinksSubscription;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeRedirectPath(path, fallback = DEFAULT_LOGIN_REDIRECT) {
  const value = String(path || "").trim();
  return sanitizeReturnPath(REDIRECT_ALIASES[value] || value, fallback);
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function getSession() {
  return getCurrentSession();
}

export async function waitForSession(timeoutMs = SESSION_WAIT_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  let session = await getCurrentSession();

  while (!session && Date.now() < deadline) {
    await delay(SESSION_WAIT_INTERVAL);
    session = await getCurrentSession();
  }

  return session;
}

export async function getAuthenticatedSession(options = {}) {
  const session = options.wait ? await waitForSession(options.timeoutMs) : await getCurrentSession();
  return session?.access_token ? session : null;
}

export async function getAccessToken(options = {}) {
  const session = await getAuthenticatedSession(options);
  return session?.access_token || null;
}

export async function getCurrentUser(options = {}) {
  const session = await getAuthenticatedSession(options);
  if (!session) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

export function rememberRedirectAfterLogin(path = DEFAULT_LOGIN_REDIRECT) {
  const target = normalizeRedirectPath(path, DEFAULT_LOGIN_REDIRECT);
  localStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, target);
  return target;
}

export function consumeRedirectAfterLogin(fallback = DEFAULT_LOGIN_REDIRECT) {
  const target = normalizeRedirectPath(localStorage.getItem(REDIRECT_AFTER_LOGIN_KEY), fallback);
  localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
  return target;
}

export function peekRedirectAfterLogin(fallback = "") {
  const stored = localStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
  return stored ? normalizeRedirectPath(stored, fallback || DEFAULT_LOGIN_REDIRECT) : fallback;
}

export async function isAdminUser(user) {
  if (!user?.email) return false;

  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  return Boolean(data && !error);
}

export async function getAuthenticatedRedirectTarget(user) {
  const params = new URLSearchParams(window.location.search);
  const storedTarget = peekRedirectAfterLogin("");
  if (storedTarget) return consumeRedirectAfterLogin(DEFAULT_LOGIN_REDIRECT);
  if (params.has("next")) return getPostLoginTarget();

  return (await isAdminUser(user)) ? "admin.html" : DEFAULT_LOGIN_REDIRECT;
}

export async function requireAuth(options = {}) {
  const redirectTo = options.redirectTo || DEFAULT_LOGIN_REDIRECT;
  const session = await getAuthenticatedSession({ wait: true, timeoutMs: options.timeoutMs });
  const user = session ? await getCurrentUser() : null;

  if (!user) {
    rememberRedirectAfterLogin(redirectTo);
    window.location.href = buildLoginRedirect(redirectTo);
    return null;
  }

  return user;
}

export async function redirectIfAuthenticated(options = {}) {
  if (getPostLoginTarget() === "admin.html") return null;

  const session = await getAuthenticatedSession({ wait: true, timeoutMs: options.timeoutMs || 800 });
  const user = session ? await getCurrentUser() : null;
  if (!user) return null;

  window.location.href = await getAuthenticatedRedirectTarget(user);
  return user;
}

export async function logoutAndRedirect(target = "login.html") {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
  await syncAccountLinks();
  window.location.href = target;
}

export async function syncAccountLinks() {
  const session = await getAuthenticatedSession().catch(() => null);
  const user = session?.user || null;
  const links = document.querySelectorAll("[data-account-link]");

  links.forEach((link) => {
    if (user) {
      link.href = "account.html";
      link.textContent = "Minha Conta";
    } else {
      link.href = "login.html";
      link.textContent = "Login";
    }
  });

  if (!accountLinksSubscription) {
    accountLinksSubscription = supabase.auth.onAuthStateChange(() => {
      syncAccountLinks().catch(() => null);
    });
  }

  return user;
}

export async function hydrateUserEmail(target) {
  const input = typeof target === "string" ? document.querySelector(target) : target;
  if (!input) return null;

  const user = await getCurrentUser().catch(() => null);
  if (user?.email) input.value = user.email;
  return user;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
}

export { supabase };
