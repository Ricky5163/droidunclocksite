import {
  DEFAULT_LOGIN_REDIRECT,
  buildLoginRedirect,
  createSupabaseBrowserClient,
  getPostLoginTarget,
} from "./app-config.js?v=supa2";

const supabase = createSupabaseBrowserClient();

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function requireAuth(options = {}) {
  const redirectTo = options.redirectTo || DEFAULT_LOGIN_REDIRECT;
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = buildLoginRedirect(redirectTo);
    return null;
  }

  return user;
}

export async function redirectIfAuthenticated() {
  const user = await getCurrentUser();
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
