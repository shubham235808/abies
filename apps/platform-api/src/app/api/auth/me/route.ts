import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    return applyRotatedCookie(
      NextResponse.json({ user: ctx.session.user, mfaVerified: ctx.session.mfaVerified }),
      ctx,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
