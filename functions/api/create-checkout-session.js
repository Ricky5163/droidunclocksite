import {
  assertEnv,
  buildValidatedOrder,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  normalizeCustomer,
  readJson,
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

    const missing = assertEnv(env, [
      "STRIPE_SECRET_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SITE_URL",
    ]);

    if (missing.length) {
      return json(request, env, 500, {
        error: "Faltam variaveis no Cloudflare: " + missing.join(", "),
      });
    }

    const body = await readJson(request);
    const { customer, missing: missingCustomer } = normalizeCustomer(body);

    if (missingCustomer.length) {
      return json(request, env, 400, { error: "Missing customer fields: " + missingCustomer.join(", ") });
    }

    const supabase = createServiceClient(env);
    const orderDraft = await buildValidatedOrder(body.cart, supabase);
    const shippingCost = Math.max(0, Number(body.shipping_cost || 0));
    const totalAmount = Number((orderDraft.total + shippingCost).toFixed(2));

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          ...customer,
          total_amount: totalAmount,
          payment_method: "stripe",
          payment_status: "pending",
          order_status: "Pending",
        },
      ])
      .select("id")
      .single();

    if (orderError) {
      return json(request, env, 500, { error: orderError.message });
    }

    const orderItems = orderDraft.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.qty,
      total_price: Number((item.price * item.qty).toFixed(2)),
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
    if (itemsError) {
      return json(request, env, 500, { error: itemsError.message });
    }

    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("customer_email", customer.customer_email);
    form.set("client_reference_id", String(order.id));
    form.set("success_url", `${env.SITE_URL}/success.html?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${env.SITE_URL}/cancel.html?order=${order.id}`);
    form.append("payment_method_types[]", "card");
    form.set("metadata[order_id]", String(order.id));

    const stripeItems = [...orderDraft.items];
    if (shippingCost > 0) {
      stripeItems.push({ name: "Shipping", price: shippingCost, qty: 1 });
    }

    stripeItems.forEach((item, index) => {
      form.set(`line_items[${index}][quantity]`, String(item.qty));
      form.set(`line_items[${index}][price_data][currency]`, "eur");
      form.set(
        `line_items[${index}][price_data][unit_amount]`,
        String(Math.round(item.price * 100))
      );
      form.set(`line_items[${index}][price_data][product_data][name]`, item.name || "Produto");
    });

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const session = await stripeResponse.json().catch(() => ({}));
    if (!stripeResponse.ok || !session.url) {
      return json(request, env, 500, {
        error: session?.error?.message || "Erro ao criar sessao Stripe.",
      });
    }

    return json(request, env, 200, { url: session.url });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}
