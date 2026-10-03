import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getOrder } from '@abies/domain/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'LAB');
    const { id } = await params;
    const order = await getOrder(ctx.session.userId, ctx.session.user.role, id);
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
