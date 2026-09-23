import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createAvailabilitySchema } from '@/modules/doctors/doctors.schemas';
import { addAvailability } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const dto = createAvailabilitySchema.parse(await req.json());
    const slot = await addAvailability(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ slot }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
