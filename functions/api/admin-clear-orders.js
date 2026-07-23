import {
  assertEnv,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  requireAdminAuth,
} from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    if (request.method !== "POST") {
      return json(request, env, 405, { error: "Method not allowed" });
    }

    if (!ensureAllowedOrigin(request, env)) {
      return json(request, env, 403, { error: "Origin not allowed" });
    }

    const missing = assertEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const supabase = createServiceClient(env);
    const admin = await requireAdminAuth(request, env, supabase);
    if (!admin) {
      return json(request, env, 403, { error: "Admin access required." });
    }

    const { count, error } = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .not("id", "is", null);

    if (error) {
      return json(request, env, 500, { error: error.message || "Could not clear orders." });
    }

    return json(request, env, 200, { deleted: count || 0 });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Could not clear orders." });
  }
}
