export async function sendEmail(env, { to, subject, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || "Resend error");
  }
  return data;
}

export function orderEmailHtml({ order, items, siteUrl }) {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.name || "")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${it.qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">€ ${Number(it.price).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;">
    <h2 style="margin:0 0 12px;">Droidunclock — Confirmação de encomenda</h2>
    <p style="margin:0 0 10px;">Obrigado! Recebemos a tua encomenda.</p>

    <div style="background:#f7f7f7;padding:12px;border-radius:10px;margin:12px 0;">
      <b>Nº Encomenda:</b> ${order.id}<br/>
      <b>Status:</b> ${order.status}<br/>
      <b>Total:</b> € ${Number(order.total || 0).toFixed(2)}<br/>
      <b>Pagamento:</b> ${escapeHtml(order.payment_provider || "")}
    </div>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Produto</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qtd</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Preço</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:16px;">
      Se precisares de ajuda, responde a este email ou visita: 
      <a href="${siteUrl}">${siteUrl}</a>
    </p>

    <p style="color:#777;margin-top:20px;">— Droidunclock</p>
  </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}