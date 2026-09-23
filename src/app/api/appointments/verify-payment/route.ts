import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { verifyPaymentSchema } from '@/modules/appointments/appointments.schemas';
import { verifyPayment } from '@/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = verifyPaymentSchema.parse(await req.json());
    const appointment = await verifyPayment(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ appointment }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
