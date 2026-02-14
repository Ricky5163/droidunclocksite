import { createClient } from "@supabase/supabase-js";
import { sendEmail, orderEmailHtml } from "./_email.js";

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    const body = await request.json().catch(() => ({}));
    const { orderId } = body;
    if (!orderId) return json(400, { error: "orderId obrigatório" });

    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // buscar order
    const { data: order, error: e1 } = await sb
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (e1) return json(500, { error: e1.message });

    // buscar items
    const { data: items, error: e2 } = await sb
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);
    if (e2) return json(500, { error: e2.message });

    const html = orderEmailHtml({ order, items, siteUrl: env.SITE_URL });

    // 1) email ao cliente
    await sendEmail(env, {
      to: order.email,
      subject: `Droidunclock — Encomenda #${order.id}`,
      html,
    });

    // 2) email ao admin (tu)
    await sendEmail(env, {
      to: env.EMAIL_TO,
      subject: `🟢 NOVA ENCOMENDA PAGA #${order.id} — € ${Number(order.total || 0).toFixed(2)}`,
      html,
    });

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { error: err?.message || "Erro" });
  }
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}