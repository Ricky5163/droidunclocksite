import { adminOrderEmailHtml, orderEmailHtml, sendEmail } from "./_email.js";
import { normalizeEmail } from "./_utils.js";

export async function sendOrderEmailsForPaidOrder(env, supabase, orderId, options = {}) {
  const force = Boolean(options.force);
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError) {
    return { ok: false, error: orderError.message || "Order lookup failed." };
  }

  if (order.payment_status !== "paid") {
    return { ok: false, error: "A encomenda ainda nao esta paga." };
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  if (itemsError) {
    return { ok: false, error: itemsError.message || "Order items lookup failed." };
  }

  const customerEmail = normalizeEmail(order.customer_email);
  if (!customerEmail) {
    return { ok: false, error: "Email do cliente invalido." };
  }

  const result = {
    ok: true,
    customer: { sent: false, skipped: false, error: null },
    admin: { sent: false, skipped: false, error: null },
  };

  if (!force && order.confirmation_email_sent_at) {
    result.customer.skipped = true;
  } else {
    try {
      const email = await sendEmail(env, {
        to: customerEmail,
        subject: `Droidunclock - Encomenda #${order.id}`,
        html: orderEmailHtml({ order, items, siteUrl: env.SITE_URL }),
      });
      result.customer.sent = true;
      result.customer.id = email?.id || null;
      await markEmailSent(supabase, orderId, { confirmation_email_sent_at: new Date().toISOString() });
    } catch (error) {
      result.ok = false;
      result.customer.error = error?.message || "Customer email failed.";
    }
  }

  if (!force && order.admin_email_sent_at) {
    result.admin.skipped = true;
  } else {
    try {
      const email = await sendEmail(env, {
        to: env.EMAIL_TO,
        subject: `Nova encomenda paga #${order.id} - EUR ${Number(order.total_amount || 0).toFixed(2)}`,
        html: adminOrderEmailHtml({ order, items, siteUrl: env.SITE_URL }),
      });
      result.admin.sent = true;
      result.admin.id = email?.id || null;
      await markEmailSent(supabase, orderId, { admin_email_sent_at: new Date().toISOString() });
    } catch (error) {
      result.ok = false;
      result.admin.error = error?.message || "Admin email failed.";
    }
  }

  return result;
}

async function markEmailSent(supabase, orderId, updates) {
  const { error } = await supabase.from("orders").update(updates).eq("id", orderId);
  if (error) {
    console.warn("[order email]", {
      orderId,
      stage: "mark_email_sent",
      errorMessage: error.message || "Could not mark email as sent.",
    });
  }
}
