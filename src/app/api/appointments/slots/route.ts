import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listSlotsQuerySchema } from '@/modules/appointments/appointments.schemas';
import { listAvailableSlots } from '@/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { searchParams } = new URL(req.url);
    const query = listSlotsQuerySchema.parse(Object.fromEntries(searchParams));
    const slots = await listAvailableSlots(query);
    return applyRotatedCookie(NextResponse.json({ slots }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
