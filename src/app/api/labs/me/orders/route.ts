import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listMineAsLab } from '@/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const orders = await listMineAsLab(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ orders }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
