import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listMineAsPharmacy } from '@/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const orders = await listMineAsPharmacy(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ orders }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
