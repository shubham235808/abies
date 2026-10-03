import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { holdSlotSchema } from '@abies/domain/modules/appointments/appointments.schemas';
import { holdSlot } from '@abies/domain/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = holdSlotSchema.parse(await req.json());
    const result = await holdSlot(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json(result, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
