import { db } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/auth/guards";
import { fail, ok, parseBody, serverError, unauthorized } from "../../../../lib/http";
import { toUserDTO } from "../../../../lib/serialize";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const profileSchema = z.object({
  /** Cloudinary secure URL returned after a direct upload. */
  avatarUrl: z.string().url("Must be a valid URL.").nullable().optional(),
  /** Display name update. */
  name: z.string().min(2, "Name must be at least 2 characters.").max(60).optional()
});

/**
 * PATCH /api/auth/profile
 *
 * Saves the Cloudinary avatar URL (and optionally a new display name) after the
 * browser has completed a direct-to-Cloudinary upload.
 *
 * The client flow is:
 *   1. POST /api/upload/sign   → get signed params
 *   2. POST cloudinary.com/…   → upload file directly, receive secure_url back
 *   3. PATCH /api/auth/profile → save secure_url in DB (this endpoint)
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const parsed = await parseBody(request, profileSchema);
    if (!parsed.ok) return parsed.response;

    const { avatarUrl, name } = parsed.data;

    // Nothing to update
    if (avatarUrl === undefined && name === undefined) {
      return fail("Provide at least one field to update.", 422);
    }

    // Only accept Cloudinary URLs for the avatar field (security guard).
    if (avatarUrl && !avatarUrl.includes("cloudinary.com")) {
      return fail("avatarUrl must be a Cloudinary URL.", 422);
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(name !== undefined ? { name } : {})
      },
      select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
    });

    return ok({ user: toUserDTO(updated) });
  } catch (error) {
    return serverError(error, "PATCH /api/auth/profile");
  }
}

/**
 * GET /api/auth/profile — return the current user's public profile.
 */
export async function GET(): Promise<Response> {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const profile = await db.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true }
    });

    if (!profile) return unauthorized();

    return ok({ user: toUserDTO(profile) });
  } catch (error) {
    return serverError(error, "GET /api/auth/profile");
  }
}
