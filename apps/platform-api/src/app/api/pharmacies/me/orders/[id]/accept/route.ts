import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { acceptOrder } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const { id } = await params;
    const order = await acceptOrder(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
