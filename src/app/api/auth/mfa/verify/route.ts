import { NextResponse } from 'next/server';
import { verifyMfaSchema } from '@/modules/auth/auth.schemas';
import { verifyAdminMfa } from '@/modules/auth/auth.service';
import { errorResponse } from '@/lib/errors';
import { applyRotatedCookie, requireSession } from '@/server/rbac';

// Admin sessions start mfaVerified=false when ADMIN_MFA_REQUIRED — this
// endpoint completes the challenge. Deliberately does NOT require
// mfaVerified=true to reach it (that would be circular); requireSession
// still enforces a valid, non-revoked session belongs to an admin account.
export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    const body = verifyMfaSchema.parse(await req.json());
    await verifyAdminMfa(ctx.session, body.code);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
