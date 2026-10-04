import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateLabProfileSchema } from '@abies/domain/modules/diagnostics/labs.schemas';
import { getMyLab, updateMyLab } from '@abies/domain/modules/diagnostics/labs.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const result = await getMyLab(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const dto = updateLabProfileSchema.parse(await req.json());
    const result = await updateMyLab(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
