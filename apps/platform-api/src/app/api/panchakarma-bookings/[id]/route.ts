import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getBooking } from '@abies/domain/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const booking = await getBooking(ctx.session.userId, ctx.session.user.role, id);
    return applyRotatedCookie(NextResponse.json({ booking }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
