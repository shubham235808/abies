import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getOrder } from '@/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
