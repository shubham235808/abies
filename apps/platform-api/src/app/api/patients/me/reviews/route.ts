import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMine } from '@abies/domain/modules/reviews/reviews.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const reviews = await listMine(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ reviews }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
