import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listMineAsPatient } from '@/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const appointments = await listMineAsPatient(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ appointments }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
