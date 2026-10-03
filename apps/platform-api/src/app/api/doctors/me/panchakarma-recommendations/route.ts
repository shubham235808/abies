import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMineAsDoctor } from '@abies/domain/modules/panchakarma/recommendations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const recommendations = await listMineAsDoctor(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ recommendations }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
