import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateWardSchema } from '@/modules/hospital/hospital.schemas';
import { updateWard } from '@/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

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
