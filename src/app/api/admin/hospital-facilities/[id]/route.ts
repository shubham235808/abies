import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateFacilitySchema } from '@/modules/hospital/hospital.schemas';
import { updateFacility } from '@/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const { id } = await params;
    const dto = updateFacilitySchema.parse(await req.json());
    const facility = await updateFacility(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ facility }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
