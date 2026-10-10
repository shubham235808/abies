import { NextResponse } from 'next/server';
import { startAdminMfaEnrollment } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

// Generates and stores a fresh pending secret every call — calling this
// again before confirming just replaces the previous pending enrollment
// (mfa.service.ts), so a caller can always restart if they lose the QR
// code or scan it wrong.
export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    const result = await startAdminMfaEnrollment(ctx.session);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
