import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updatePatientProfileSchema } from '@abies/domain/modules/patients/patients.schemas';
import { getMyProfile, updateMyProfile } from '@abies/domain/modules/patients/patients.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const result = await getMyProfile(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = updatePatientProfileSchema.parse(await req.json());
    const profile = await updateMyProfile(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ profile }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
