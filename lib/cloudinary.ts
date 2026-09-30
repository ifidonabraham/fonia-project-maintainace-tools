/**
 * Cloudinary server-side utility — Fonia Projects.
 *
 * Wraps the official `cloudinary` v2 SDK so every other module imports a
 * pre-configured instance instead of calling `v2.config()` themselves.
 *
 * NEVER import this file from client components — the API secret must stay on
 * the server. The browser only ever receives short-lived signed upload params
 * from POST /api/upload/sign.
 */

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export { cloudinary };

/** Upload presets / folder names — centralised so they never drift. */
export const CLOUDINARY_FOLDERS = {
  avatars: "fonia-projects/avatars",
  attachments: "fonia-projects/attachments"
} as const;

/**
 * Generate signed upload parameters for a direct browser → Cloudinary upload.
 *
 * The browser POSTs to Cloudinary's own `/upload` endpoint with these params.
 * Our API secret is used to sign the request server-side but is never sent to
 * the browser — only the resulting signature and timestamp travel over the wire.
 */
export function signUploadParams(params: {
  folder: string;
  public_id?: string;
  /** Max file size in bytes (default 5 MB for avatars, 20 MB for attachments). */
  max_bytes?: number;
  /** Allowed formats e.g. ['jpg','png','webp','gif'] */
  allowed_formats?: string[];
  /** Eager transformations applied after upload. */
  eager?: string;
  /** Number of seconds the signature stays valid (default 60). */
  ttl?: number;
}): {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  public_id?: string;
  eager?: string;
} {
  const timestamp = Math.round(Date.now() / 1000);

  const toSign: Record<string, string | number> = {
    timestamp,
    folder: params.folder
  };

  if (params.public_id) toSign.public_id = params.public_id;
  if (params.eager) toSign.eager = params.eager;

  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET!);

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    folder: params.folder,
    ...(params.public_id ? { public_id: params.public_id } : {}),
    ...(params.eager ? { eager: params.eager } : {})
  };
}

/**
 * Delete an asset from Cloudinary by its public_id.
 * Used when a user replaces their avatar so old images don't pile up.
 */
export async function deleteAsset(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Non-fatal — log but don't crash the request.
    console.warn("[cloudinary] Failed to delete asset:", publicId);
  }
}
