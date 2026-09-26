import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listMineAsCentre } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const bookings = await listMineAsCentre(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ bookings }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
