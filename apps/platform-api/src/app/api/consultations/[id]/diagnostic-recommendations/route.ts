import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createRecommendationSchema } from '@abies/domain/modules/diagnostics/recommendations.schemas';
import { createRecommendation } from '@abies/domain/modules/diagnostics/recommendations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = createRecommendationSchema.parse(await req.json());
    const recommendation = await createRecommendation(ctx.session.userId, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ recommendation }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
