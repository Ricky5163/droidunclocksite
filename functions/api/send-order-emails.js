import { sendEmail, adminOrderEmailHtml, orderEmailHtml } from "./_email.js";
import {
  assertEnv,
  createServiceClient,
  json,
  normalizeEmail,
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
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (orderError) {
      return json(request, env, 500, { error: orderError.message });
    }

    if (order.payment_status !== "paid") {
      return json(request, env, 409, { error: "A encomenda ainda nao esta paga." });
    }

    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    if (itemsError) {
      return json(request, env, 500, { error: itemsError.message });
    }

    const customerEmail = normalizeEmail(order.customer_email);
    if (!customerEmail) {
      return json(request, env, 500, { error: "Email do cliente invalido." });
    }

    const html = orderEmailHtml({ order, items, siteUrl: env.SITE_URL });
    const adminHtml = adminOrderEmailHtml({ order, items, siteUrl: env.SITE_URL });

    await sendEmail(env, {
      to: customerEmail,
      subject: `Droidunclock - Encomenda #${order.id}`,
      html,
    });

    await sendEmail(env, {
      to: env.EMAIL_TO,
      subject: `Nova encomenda paga #${order.id} - EUR ${Number(order.total_amount || 0).toFixed(2)}`,
      html: adminHtml,
    });

    return json(request, env, 200, { ok: true });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}
