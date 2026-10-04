import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMineAsPharmacy } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const orders = await listMineAsPharmacy(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ orders }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
