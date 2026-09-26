import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { verifyBookingPaymentSchema } from '@/modules/panchakarma/bookings.schemas';
import { verifyBookingPayment } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = verifyBookingPaymentSchema.parse(await req.json());
    const booking = await verifyBookingPayment(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ booking }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
