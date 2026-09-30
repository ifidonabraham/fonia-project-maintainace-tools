import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/verify-email?token=<raw-token>
 *
 * Marks the account as email-verified and redirects to the dashboard.
 * The raw token is SHA-256 hashed before the DB lookup so the stored
 * value is never usable if the DB is ever read by an attacker.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawToken = searchParams.get("token");

  if (!rawToken) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url));
  }

  const hashedToken = createHash("sha256").update(rawToken).digest("hex");

  const user = await db.user.findFirst({
    where: { verifyToken: hashedToken, verifyTokenExp: { gt: new Date() } },
    select: { id: true, emailVerified: true }
  });

  if (!user) {
    return NextResponse.redirect(
      new URL("/login?error=verify_expired&message=Verification+link+expired.+Please+sign+in+and+request+a+new+one.", request.url)
    );
  }

  if (!user.emailVerified) {
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null, verifyTokenExp: null }
    });
  }

  return NextResponse.redirect(new URL("/dashboard?verified=1", request.url));
}
