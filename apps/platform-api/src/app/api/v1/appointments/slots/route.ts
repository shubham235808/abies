import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listSlotsQuerySchema } from '@abies/domain/modules/appointments/appointments.schemas';
import { listAvailableSlots } from '@abies/domain/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { searchParams } = new URL(req.url);
    const query = listSlotsQuerySchema.parse(Object.fromEntries(searchParams));
    const slots = await listAvailableSlots(query);
    return applyRotatedCookie(NextResponse.json({ slots }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
