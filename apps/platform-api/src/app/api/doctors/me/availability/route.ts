import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createAvailabilitySchema } from '@abies/domain/modules/doctors/doctors.schemas';
import { addAvailability } from '@abies/domain/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

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
