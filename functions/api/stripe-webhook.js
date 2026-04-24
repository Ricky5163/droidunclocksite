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

    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const orderId = session?.metadata?.order_id;

      if (orderId) {
        const result = await markOrderPaid(supabase, orderId, {
          stripe_payment_intent_id: session.payment_intent ?? null,
        });

        if (result.changed) {
          await triggerOrderEmails(env, orderId);
        }
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Server error", { status: 500 });
  }
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
