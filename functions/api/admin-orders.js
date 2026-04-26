import {
  assertEnv,
  createServiceClient,
  decryptOrderCustomer,
  json,
  requireAdminAuth,
} from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  try {
    if (request.method !== "GET") {
      return json(request, env, 405, { error: "Method not allowed" });
    }

    const missing = assertEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const supabase = createServiceClient(env);
    const admin = await requireAdminAuth(request, env, supabase);
    if (!admin) {
      return json(request, env, 403, { error: "Admin access required." });
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id,customer_name,customer_email,customer_phone,country,address,postal_code,city,total_amount,payment_method,payment_status,order_status,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (ordersError) {
      return json(request, env, 500, { error: ordersError.message });
    }

    const orderIds = (orders || []).map((order) => order.id);
    const { data: items, error: itemsError } = orderIds.length
      ? await supabase
          .from("order_items")
          .select("order_id,product_name,quantity,unit_price,total_price")
          .in("order_id", orderIds)
      : { data: [], error: null };

    if (itemsError) {
      return json(request, env, 500, { error: itemsError.message });
    }

    const itemsByOrder = new Map();
    for (const item of items || []) {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    const safeOrders = [];
    for (const order of orders || []) {
      const decrypted = await decryptOrderCustomer(order, env);
      safeOrders.push({
        ...decrypted,
        items: itemsByOrder.get(order.id) || [],
      });
    }

    return json(request, env, 200, { orders: safeOrders });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Erro" });
  }
}
