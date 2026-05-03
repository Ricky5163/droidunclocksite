const ENCRYPTED_VALUE_PREFIX = "enc:v1";
const GCM_TAG_BYTES = 16;

export async function encryptSensitiveData(data, env) {
  if (!hasSensitiveData(data)) return null;

  if (typeof data === "string") {
    return encryptText(data, env);
  }

  if (Array.isArray(data)) {
    const encryptedItems = [];
    for (const item of data) {
      encryptedItems.push(await encryptSensitiveData(item, env));
    }
    return encryptedItems;
  }

  if (typeof data === "object") {
    const encrypted = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (hasSensitiveData(value)) {
        encrypted[key] = await encryptSensitiveData(value, env);
      }
    }
    return Object.keys(encrypted).length ? encrypted : null;
  }

  return encryptText(String(data), env);
}

export async function decryptSensitiveData(data, env) {
  if (!data) return data;

  if (typeof data === "string") {
    return decryptText(data, env);
  }

  if (Array.isArray(data)) {
    const decryptedItems = [];
    for (const item of data) {
      decryptedItems.push(await decryptSensitiveData(item, env));
    }
    return decryptedItems;
  }

  if (typeof data === "object") {
    const decrypted = {};
    for (const [key, value] of Object.entries(data)) {
      decrypted[key] = await decryptSensitiveData(value, env);
    }
    return decrypted;
  }

  return data;
}

export function normalizeSensitiveOrderData(body = {}) {
  const sensitive = {
    private_notes: cleanOptionalText(body.private_notes || body.privateNotes),
    customer_notes: cleanOptionalText(body.customer_notes || body.customerNotes),
    sensitive_message: cleanOptionalText(body.sensitive_message || body.sensitiveMessage),
    internal_observations: cleanOptionalText(body.internal_observations || body.internalObservations),
    technical_details: cleanOptionalText(body.technical_details || body.technicalDetails),
  };

  return Object.fromEntries(Object.entries(sensitive).filter(([, value]) => value));
}

async function encryptText(value, env) {
  const text = String(value || "");
  if (!text || text.startsWith(`${ENCRYPTED_VALUE_PREFIX}:`)) return text;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    new TextEncoder().encode(text)
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - GCM_TAG_BYTES);
  const authTag = encryptedBytes.slice(encryptedBytes.length - GCM_TAG_BYTES);

  return [
    ENCRYPTED_VALUE_PREFIX,
    base64FromBytes(iv),
    base64FromBytes(ciphertext),
    base64FromBytes(authTag),
  ].join(":");
}

async function decryptText(value, env) {
  const text = String(value || "");
  if (!text.startsWith(`${ENCRYPTED_VALUE_PREFIX}:`)) return text;

  const [, version, ivBase64, ciphertextBase64, authTagBase64] = text.split(":");
  if (version !== "v1" || !ivBase64 || !ciphertextBase64 || !authTagBase64) return "";

  const ciphertext = bytesFromBase64(ciphertextBase64);
  const authTag = bytesFromBase64(authTagBase64);
  const encryptedBytes = new Uint8Array(ciphertext.length + authTag.length);
  encryptedBytes.set(ciphertext);
  encryptedBytes.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesFromBase64(ivBase64), tagLength: 128 },
    await encryptionKey(env),
    encryptedBytes
  );

  return new TextDecoder().decode(decrypted);
}

async function encryptionKey(env) {
  const rawKey = parseEncryptionKey(env.ENCRYPTION_KEY);
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function parseEncryptionKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    throw new Error("Missing ENCRYPTION_KEY.");
  }

  if (/^[a-f0-9]{64}$/i.test(key)) {
    return Uint8Array.from(key.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
  }

  const base64Bytes = tryBase64Key(key);
  if (base64Bytes) return base64Bytes;

  const utf8Bytes = new TextEncoder().encode(key);
  if (utf8Bytes.length === 32) return utf8Bytes;

  throw new Error("ENCRYPTION_KEY must be exactly 32 bytes, 64 hex characters, or base64 for 32 bytes.");
}

function tryBase64Key(value) {
  try {
    const bytes = bytesFromBase64(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function cleanOptionalText(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 4000) : "";
}

function hasSensitiveData(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasSensitiveData);
  if (typeof value === "object") return Object.values(value).some(hasSensitiveData);
  return true;
}

function base64FromBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bytesFromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
