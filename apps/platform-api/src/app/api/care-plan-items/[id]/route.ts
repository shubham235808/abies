import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateCarePlanItemSchema } from '@abies/domain/modules/care-plans/care-plans.schemas';
import { updateCarePlanItem } from '@abies/domain/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateCarePlanItemSchema.parse(await req.json());
    const item = await updateCarePlanItem(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ item }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
