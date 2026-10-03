import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { transitionCarePlanSchema } from '@abies/domain/modules/care-plans/care-plans.schemas';
import { transitionCarePlan } from '@abies/domain/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = transitionCarePlanSchema.parse(await req.json());
    const carePlan = await transitionCarePlan(ctx.session.userId, id, dto.status, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ carePlan }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
