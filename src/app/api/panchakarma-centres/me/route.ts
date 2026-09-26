import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateCentreProfileSchema } from '@/modules/panchakarma/centres.schemas';
import { getMyCentre, updateMyCentre } from '@/modules/panchakarma/centres.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const result = await getMyCentre(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const dto = updateCentreProfileSchema.parse(await req.json());
    const result = await updateMyCentre(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
