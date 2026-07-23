import {
  assertEnv,
  createServiceClient,
  ensureAllowedOrigin,
  handleOptions,
  json,
  requireAdminAuth,
} from "./_utils.js";

const BUCKET_NAME = "product-images";
const MAX_IMAGE_SIZE = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

    const missing = assertEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (missing.length) {
      return json(request, env, 500, { error: "Missing env: " + missing.join(", ") });
    }

    const supabase = createServiceClient(env);
    const admin = await requireAdminAuth(request, env, supabase);
    if (!admin) {
      return json(request, env, 403, { error: "Admin access required." });
    }

    const formData = await request.formData();
    const file = formData.get("image");
    const productSlug = safePathPart(formData.get("productSlug") || "product");

    if (!file || typeof file === "string") {
      return json(request, env, 400, { error: "Image file is required." });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return json(request, env, 400, { error: "Use JPG, PNG, WebP, or GIF images." });
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return json(request, env, 400, { error: "Image must be 6MB or smaller." });
    }

    await ensureProductImagesBucket(supabase);

    const extension = extensionFor(file.name, file.type);
    const objectPath = `${productSlug}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(objectPath, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return json(request, env, 500, { error: uploadError.message || "Image upload failed." });
    }

    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath);
    return json(request, env, 200, { url: data.publicUrl, path: objectPath });
  } catch (error) {
    return json(request, env, 500, { error: error?.message || "Image upload failed." });
  }
}

async function ensureProductImagesBucket(supabase) {
  const { data } = await supabase.storage.getBucket(BUCKET_NAME);
  if (data) return;

  const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_IMAGE_SIZE,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });

  if (error && !/already exists/i.test(error.message || "")) {
    throw error;
  }
}

function safePathPart(value) {
  return String(value || "product")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "product";
}

function extensionFor(name, type) {
  const extension = String(name || "").split(".").pop()?.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}
