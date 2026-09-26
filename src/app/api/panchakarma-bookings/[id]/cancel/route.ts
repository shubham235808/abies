import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { cancelBookingSchema } from '@/modules/panchakarma/bookings.schemas';
import { cancelBooking } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const dto = cancelBookingSchema.parse(await req.json().catch(() => ({})));
    const booking = await cancelBooking(ctx.session.userId, ctx.session.user.role, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ booking }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
