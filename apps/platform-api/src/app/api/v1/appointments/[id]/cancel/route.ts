import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { cancelAppointmentSchema } from '@abies/domain/modules/appointments/appointments.schemas';
import { cancelAppointment } from '@abies/domain/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'DOCTOR');
    const { id } = await params;
    const dto = cancelAppointmentSchema.parse(await req.json().catch(() => ({})));
    const appointment = await cancelAppointment(ctx.session.userId, ctx.session.user.role, id, dto, {
      userId: ctx.session.userId,
      ...ctx,
    });
    return applyRotatedCookie(NextResponse.json({ appointment }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
