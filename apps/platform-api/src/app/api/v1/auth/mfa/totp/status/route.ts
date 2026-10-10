import { NextResponse } from 'next/server';
import { adminMfaEnrollmentStatus } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

// Deliberately does NOT require mfaVerified — a session needs to know
// whether it's enrolled BEFORE it can complete the MFA step, same
// reasoning as /auth/mfa/verify not requiring it.
export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const result = await adminMfaEnrollmentStatus(ctx.session);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
