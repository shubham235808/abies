import { NextResponse } from 'next/server';
import { verifyMfaSchema } from '@abies/domain/modules/auth/auth.schemas';
import { confirmAdminMfaEnrollment } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

// On success this also completes the current session's MFA step
// (auth.service.ts's confirmAdminMfaEnrollment) — the caller just proved a
// real code, so there's no separate "now verify again" round trip.
export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    const body = verifyMfaSchema.parse(await req.json());
    await confirmAdminMfaEnrollment(ctx.session, body.code);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
