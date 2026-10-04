import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { resolveJoinInfo } from '@abies/domain/lib/video';
import { recordJoin } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'DOCTOR');
    const { id } = await params;
    await recordJoin(ctx.session.userId, ctx.session.user.role, id);
    return applyRotatedCookie(NextResponse.json(resolveJoinInfo()), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
