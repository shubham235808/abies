import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMyStockMovements } from '@abies/domain/modules/medicines/stock-movements.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const movements = await listMyStockMovements(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ movements }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
