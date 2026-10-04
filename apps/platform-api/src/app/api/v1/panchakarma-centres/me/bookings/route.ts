import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMineAsCentre } from '@abies/domain/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const bookings = await listMineAsCentre(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ bookings }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
