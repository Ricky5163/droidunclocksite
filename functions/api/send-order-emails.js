import { sendOrderEmailsForPaidOrder } from "./_order-emails.js";
import {
  assertEnv,
  createServiceClient,
  json,
  readJson,
  requireInternalAuth,
} from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method !== "POST") {
      return json(request, env, 405, { error: "Method not allowed" });
    }

    const missing = assertEnv(env, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SITE_URL",
      "EMAIL_TO",
      "EMAIL_FROM",
      "RESEND_API_KEY",
      "INTERNAL_API_SECRET",
    ]);

    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    if (!requireInternalAuth(request, env)) {
      return json(request, env, 403, { error: "Forbidden" });
    }

    const body = await readJson(request);
    const orderId = String(body.orderId || "").trim();
    if (!orderId) {
      return json(request, env, 400, { error: "orderId obrigatorio" });
    }

    const supabase = createServiceClient(env);
    const result = await sendOrderEmailsForPaidOrder(env, supabase, orderId, {
      force: Boolean(body.force),
    });
    if (!result.ok) {
      return json(request, env, 500, result);
    }

    return json(request, env, 200, result);
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}
