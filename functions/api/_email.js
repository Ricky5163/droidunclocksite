export async function sendEmail(env, { to, subject, html }) {
  const response = await fetch("https://api.resend.com/emails", {
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "Resend error");
  }

  return data;
}

export function orderEmailHtml({ order, items, siteUrl }) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.product_name || item.name || "")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || item.qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">EUR ${Number(item.unit_price || item.price || 0).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827;">
    <h2 style="margin:0 0 12px;">Droidunclock - Confirmacao de encomenda</h2>
    <p style="margin:0 0 10px;">Obrigado. Recebemos a tua encomenda e o pagamento foi confirmado.</p>

    <div style="background:#f5f7fb;padding:14px;border-radius:12px;margin:16px 0;">
      <b>Encomenda:</b> ${order.id}<br/>
      <b>Status:</b> ${escapeHtml(order.order_status || order.payment_status || "")}<br/>
      <b>Total:</b> EUR ${Number(order.total_amount || order.total || 0).toFixed(2)}<br/>
      <b>Pagamento:</b> ${escapeHtml(order.payment_method || order.payment_provider || "")}
    </div>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Produto</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qtd</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Preco</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:16px;">
      Se precisares de ajuda, responde a este email ou visita
      <a href="${siteUrl}">${siteUrl}</a>.
    </p>

    <p style="color:#6b7280;margin-top:20px;">- Droidunclock</p>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
