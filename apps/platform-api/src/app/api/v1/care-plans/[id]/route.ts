import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateCarePlanDetailsSchema } from '@abies/domain/modules/care-plans/care-plans.schemas';
import { getCarePlan, updateCarePlanDetails } from '@abies/domain/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'DOCTOR');
    const { id } = await params;
    const carePlan = await getCarePlan(ctx.session.userId, ctx.session.user.role, id);
    return applyRotatedCookie(NextResponse.json({ carePlan }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateCarePlanDetailsSchema.parse(await req.json());
    const carePlan = await updateCarePlanDetails(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ carePlan }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
