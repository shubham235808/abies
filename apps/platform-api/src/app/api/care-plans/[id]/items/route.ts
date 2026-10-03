import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createCarePlanItemSchema } from '@abies/domain/modules/care-plans/care-plans.schemas';
import { addCarePlanItem } from '@abies/domain/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = createCarePlanItemSchema.parse(await req.json());
    const item = await addCarePlanItem(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ item }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
