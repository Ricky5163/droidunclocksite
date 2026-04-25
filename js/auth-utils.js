import {
  DEFAULT_LOGIN_REDIRECT,
  buildLoginRedirect,
  createSupabaseBrowserClient,
  getPostLoginTarget,
} from "./app-config.js?v=auth3";

const supabase = createSupabaseBrowserClient();
const SESSION_WAIT_TIMEOUT = 3000;
const SESSION_WAIT_INTERVAL = 100;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function waitForSession(timeoutMs = SESSION_WAIT_TIMEOUT) {
  const deadline = Date.now() + timeoutMs;
  let session = await getSession();

  while (!session && Date.now() < deadline) {
    await delay(SESSION_WAIT_INTERVAL);
    session = await getSession();
  }

  return session;
}

export async function getCurrentUser(options = {}) {
  const session = options.wait ? await waitForSession(options.timeoutMs) : await getSession();
  return session?.user || null;
}

export async function requireAuth(options = {}) {
  const redirectTo = options.redirectTo || DEFAULT_LOGIN_REDIRECT;
  const user = await getCurrentUser({ wait: true });

  if (!user) {
    window.location.href = buildLoginRedirect(redirectTo);
    return null;
  }

  return user;
}

export async function redirectIfAuthenticated() {
  const user = await getCurrentUser({ wait: true, timeoutMs: 800 });
  if (!user) return null;

  window.location.href = getPostLoginTarget();
  return user;
}

export async function logoutAndRedirect(target = "login.html") {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;

  window.location.href = target;
}

export async function syncAccountLinks() {
  const user = await getCurrentUser().catch(() => null);
  const links = document.querySelectorAll("[data-account-link]");

  links.forEach((link) => {
    if (user) {
      link.href = "shop.html";
      link.textContent = "Area do cliente";
    } else {
      link.href = "login.html";
      link.textContent = "Entrar";
    }
  });

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
