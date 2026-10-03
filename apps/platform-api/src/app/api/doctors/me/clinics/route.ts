import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createClinicSchema } from '@abies/domain/modules/doctors/doctors.schemas';
import { addClinic } from '@abies/domain/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const dto = createClinicSchema.parse(await req.json());
    const clinic = await addClinic(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ clinic }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
