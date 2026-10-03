import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { cancelRecommendation } from '@abies/domain/modules/panchakarma/recommendations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const recommendation = await cancelRecommendation(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ recommendation }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
