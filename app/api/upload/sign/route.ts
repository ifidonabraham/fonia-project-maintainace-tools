import { getCurrentUser } from "../../../../lib/auth/guards";
import { signUploadParams, CLOUDINARY_FOLDERS } from "../../../../lib/cloudinary";
import { fail, ok, serverError, unauthorized } from "../../../../lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/upload/sign
 *
 * Returns short-lived signed Cloudinary upload parameters so the browser can
 * POST a file directly to Cloudinary without routing it through this server.
 *
 * Body: { type: "avatar" | "attachment", filename?: string }
 *
 * The API secret never leaves the server — only the resulting signature and
 * timestamp are returned to the client.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    let body: { type?: string; filename?: string };
    try {
      body = (await request.json()) as { type?: string; filename?: string };
    } catch {
      return fail("Request body must be valid JSON.");
    }

    const { type = "avatar" } = body;

    if (type !== "avatar" && type !== "attachment") {
      return fail("type must be 'avatar' or 'attachment'.", 422);
    }

    if (type === "avatar") {
      // Each user gets a deterministic public_id so replacing the avatar
      // automatically overwrites the old one in Cloudinary.
      const params = signUploadParams({
        folder: CLOUDINARY_FOLDERS.avatars,
        public_id: `${CLOUDINARY_FOLDERS.avatars}/${user.id}`,
        // Resize and crop to a square on upload — saves bandwidth for every
        // subsequent request and ensures consistent avatar sizes in the UI.
        eager: "c_fill,g_face,h_200,w_200/f_auto,q_auto"
      });

      return ok({ ...params, uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/image/upload` });
    }

    // attachment — no eager transform, allow common image + doc types
    const params = signUploadParams({
      folder: CLOUDINARY_FOLDERS.attachments
    });

    return ok({
      ...params,
      uploadUrl: `https://api.cloudinary.com/v1_1/${params.cloudName}/auto/upload`
    });
  } catch (error) {
    return serverError(error, "POST /api/upload/sign");
  }
}
