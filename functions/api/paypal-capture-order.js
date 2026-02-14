import { createClient } from "@supabase/supabase-js";

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });

    const body = await request.json().catch(() => ({}));
    const { paypalOrderId, orderId } = body;

    if (!paypalOrderId) return json(400, { error: "paypalOrderId obrigatório" });

    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // token PayPal
    const token = await paypalToken(env);

    // capture
    const res = await fetch(`${env.PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json(500, { error: data?.message || "Erro capture PayPal", raw: data });

    // marcar paid no Supabase
    // (se tiveres orderId na query, usamos; senão usamos paypal_order_id)
    if (orderId) {
      await sb.from("orders").update({ status: "paid" }).eq("id", orderId);
    } else {
      await sb.from("orders").update({ status: "paid" }).eq("paypal_order_id", paypalOrderId);
    }

    // disparar emails
    const finalOrderId = orderId || (await findOrderIdByPaypal(sb, paypalOrderId));
    if (finalOrderId) {
      await fetch(`${env.SITE_URL}/api/send-order-emails`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: finalOrderId }),
      });
    }

    return json(200, { ok: true, data });
  } catch (err) {
    return json(500, { error: err?.message || "Erro" });
  }
}

async function findOrderIdByPaypal(sb, paypalOrderId) {
  const { data } = await sb.from("orders").select("id").eq("paypal_order_id", paypalOrderId).single();
  return data?.id || null;
}

async function paypalToken(env) {
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_description || "Erro token PayPal");
  return data.access_token;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}