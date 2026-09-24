import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createCarePlanSchema } from '@/modules/care-plans/care-plans.schemas';
import { createCarePlan } from '@/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const dto = createCarePlanSchema.parse(await req.json());
    const carePlan = await createCarePlan(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ carePlan }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
