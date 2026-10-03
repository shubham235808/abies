import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateDoctorProfileSchema } from '@abies/domain/modules/doctors/doctors.schemas';
import { getMe, updateMe } from '@abies/domain/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const result = await getMe(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const dto = updateDoctorProfileSchema.parse(await req.json());
    const result = await updateMe(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
