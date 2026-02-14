import { createClient } from "@supabase/supabase-js";

export async function onRequest(context) {
  try {
    const { request, env } = context;

    if (request.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const missing = [];
    if (!env.SUPABASE_URL) missing.push("SUPABASE_URL");
    if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!env.PAYPAL_API_BASE) missing.push("PAYPAL_API_BASE");
    if (!env.PAYPAL_CLIENT_ID) missing.push("PAYPAL_CLIENT_ID");
    if (!env.PAYPAL_CLIENT_SECRET) missing.push("PAYPAL_CLIENT_SECRET");
    if (missing.length) return json(500, { error: "Missing env: " + missing.join(", ") });

    const body = await request.json().catch(() => ({}));
    const { paypalOrderId } = body;

    if (!paypalOrderId) return json(400, { error: "paypalOrderId obrigatório" });

    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const token = await paypalToken(env);

    const res = await fetch(
      `${env.PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return json(500, { error: data?.message || data?.error_description || "Erro capture PayPal" });
    }

    // marcar paid no Supabase
    await sb.from("orders").update({ status: "paid" }).eq("paypal_order_id", paypalOrderId);

    return json(200, { ok: true, data });
  } catch (err) {
    return json(500, { error: err?.message || "Erro" });
  }
}

async function paypalToken(env) {
  const basic = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);

  const res = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || "Erro token PayPal");
  return data.access_token;
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}