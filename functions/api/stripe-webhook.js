import {
  assertEnv,
  createServiceClient,
  markOrderPaid,
  triggerOrderEmails,
} from "./_utils.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  if (!signatureHeader) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const missing = assertEnv(env, [
    "STRIPE_WEBHOOK_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SITE_URL",
    "INTERNAL_API_SECRET",
  ]);

  if (missing.length) {
    return new Response("Missing env: " + missing.join(", "), { status: 500 });
  }

  const validSignature = await verifyStripeSignature(
    rawBody,
    signatureHeader,
    env.STRIPE_WEBHOOK_SECRET
  );

  if (!validSignature) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const supabase = createServiceClient(env);
    console.log("[stripe webhook]", {
      eventType: event.type || null,
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const orderId = String(session?.metadata?.order_id || session?.client_reference_id || "").trim();
      const sessionId = session?.id || null;
      const paymentIntentId = session?.payment_intent || null;

      console.log("[stripe webhook]", {
        eventType: event.type,
        orderId: orderId || null,
        sessionId,
        paymentIntentId,
        paymentStatus: session?.payment_status || null,
      });

      if (orderId) {
        const validationError = await validateStripeSession(supabase, session, orderId);
        if (validationError) {
          console.warn("[stripe webhook]", {
            eventType: event.type,
            orderId,
            sessionId,
            paymentIntentId,
            stage: "validate_session",
            errorMessage: validationError,
          });
          return new Response(validationError, { status: 409 });
        }

        let result;
        try {
          result = await markOrderPaid(supabase, orderId, {
            stripe_payment_intent_id: paymentIntentId,
          });
        } catch (error) {
          console.warn("[stripe webhook]", {
            eventType: event.type,
            orderId,
            sessionId,
            paymentIntentId,
            stage: "mark_order_paid",
            errorMessage: error?.message || "markOrderPaid failed.",
          });
          throw error;
        }

        console.log("[stripe webhook]", {
          eventType: event.type,
          orderId,
          sessionId,
          paymentIntentId,
          stage: "mark_order_paid",
          changed: result.changed,
          paymentStatus: result.order?.payment_status || null,
          orderStatus: result.order?.order_status || null,
        });

        if (result.changed) {
          const emailResult = await triggerOrderEmails(env, orderId);
          console.log("[stripe webhook]", {
            eventType: event.type,
            orderId,
            sessionId,
            paymentIntentId,
            stage: "send_order_emails",
            emailSent: Boolean(emailResult?.ok),
            emailStatus: emailResult?.status || null,
            errorMessage: emailResult?.ok ? null : emailResult?.error || "Email was not sent.",
          });
        }
      } else {
        console.warn("[stripe webhook]", {
          eventType: event.type,
          sessionId,
          paymentIntentId,
          stage: "resolve_order",
          errorMessage: "Missing order id in Stripe session metadata and client_reference_id.",
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Server error", { status: 500 });
  }
}

async function validateStripeSession(supabase, session, orderId) {
  if (session.payment_status && session.payment_status !== "paid") {
    return "Stripe session is not paid";
  }

  if (session.currency && String(session.currency).toLowerCase() !== "eur") {
    return "Stripe currency mismatch";
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,total_amount")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return "Order not found";
  }

  const paidTotal = Number(session.amount_total || 0) / 100;
  const expectedTotal = Number(order.total_amount || 0);
  if (!Number.isFinite(paidTotal) || Math.abs(paidTotal - expectedTotal) > 0.01) {
    return "Stripe amount mismatch";
  }

  return "";
}

async function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signaturePart = parts.find((part) => part.startsWith("v1="));

  if (!timestampPart || !signaturePart) {
    return false;
  }

  const timestamp = timestampPart.slice(2);
  const signature = signaturePart.slice(3);
  const now = Math.floor(Date.now() / 1000);
  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber) || Math.abs(now - timestampNumber) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = await hmacSha256Hex(secret, signedPayload);

  return timingSafeEqual(expectedSignature, signature);
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bufferToHex(signature);
}

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let hex = "";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}
