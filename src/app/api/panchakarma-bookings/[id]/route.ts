import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getBooking } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
