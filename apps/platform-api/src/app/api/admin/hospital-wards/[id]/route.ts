import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateWardSchema } from '@abies/domain/modules/hospital/hospital.schemas';
import { updateWard } from '@abies/domain/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const { id } = await params;
    const dto = updateWardSchema.parse(await req.json());
    const ward = await updateWard(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ward }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
