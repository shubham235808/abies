import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createClinicSchema } from '@/modules/doctors/doctors.schemas';
import { addClinic } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
