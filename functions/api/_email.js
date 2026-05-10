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
  const currency = escapeHtml(order.payment_currency || "EUR");
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.product_name || item.name || "")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || item.qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency} ${Number(item.unit_price || item.price || 0).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency} ${Number(item.total_price || Number(item.unit_price || item.price || 0) * Number(item.quantity || item.qty || 0)).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827;">
    <h2 style="margin:0 0 12px;">Droidunclock - Confirmacao da encomenda</h2>
    <p style="margin:0 0 10px;">Ola ${escapeHtml(order.customer_name || "")},</p>
    <p style="margin:0 0 10px;">Obrigado pela sua encomenda. Recebemos o pagamento e a sua encomenda esta a ser processada.</p>
    <p style="margin:0 0 10px;">Quando a encomenda for enviada, recebera o numero de tracking por email.</p>

    <div style="background:#f5f7fb;padding:14px;border-radius:12px;margin:16px 0;">
      <b>Encomenda:</b> ${order.id}<br/>
      <b>Estado:</b> ${escapeHtml(order.order_status || order.payment_status || "")}<br/>
      <b>Total:</b> ${currency} ${Number(order.total_amount || order.total || 0).toFixed(2)}<br/>
      <b>Metodo de pagamento:</b> ${escapeHtml(order.payment_method || order.payment_provider || "")}
    </div>

    <div style="background:#fff;border:1px solid #e5e7eb;padding:14px;border-radius:12px;margin:16px 0;">
      <b>Cliente:</b> ${escapeHtml(order.customer_name || "")}<br/>
      <b>Email:</b> ${escapeHtml(order.customer_email || "")}<br/>
      <b>Telefone:</b> ${escapeHtml(order.customer_phone || "")}<br/>
      <b>Morada de envio:</b> ${escapeHtml(formatAddress(order))}
    </div>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Produto</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qtd</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Preco unit.</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Total</th>
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

export function adminOrderEmailHtml({ order, items, siteUrl }) {
  const currency = escapeHtml(order.payment_currency || "EUR");
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.product_name || item.name || "")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity || item.qty}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency} ${Number(item.unit_price || item.price || 0).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${currency} ${Number(item.total_price || Number(item.unit_price || item.price || 0) * Number(item.quantity || item.qty || 0)).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111827;">
    <h2 style="margin:0 0 12px;">Droidunclock - Nova encomenda paga</h2>

    <div style="background:#f5f7fb;padding:14px;border-radius:12px;margin:16px 0;">
      <b>Encomenda:</b> ${order.id}<br/>
      <b>Status:</b> ${escapeHtml(order.order_status || order.payment_status || "")}<br/>
      <b>Total:</b> ${currency} ${Number(order.total_amount || order.total || 0).toFixed(2)}<br/>
      <b>Pagamento:</b> ${escapeHtml(order.payment_method || order.payment_provider || "")}<br/>
    </div>

    <div style="background:#fff;border:1px solid #e5e7eb;padding:14px;border-radius:12px;margin:16px 0;">
      <b>Cliente:</b> ${escapeHtml(order.customer_name || "")}<br/>
      <b>Email:</b> ${escapeHtml(order.customer_email || "")}<br/>
      <b>Telefone:</b> ${escapeHtml(order.customer_phone || "")}<br/>
      <b>Morada de envio:</b> ${escapeHtml(formatAddress(order))}
    </div>

    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Produto</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qtd</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Preco unit.</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="margin-top:16px;">
      Admin:
      <a href="${siteUrl}/admin.html">${siteUrl}/admin.html</a>.
    </p>
  </div>`;
}

function formatAddress(order) {
  return [
    order.address,
    [order.postal_code, order.city].filter(Boolean).join(" "),
    order.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
