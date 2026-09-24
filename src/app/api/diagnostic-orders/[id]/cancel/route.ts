import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { cancelOrderSchema } from '@/modules/diagnostics/orders.schemas';
import { cancelOrder } from '@/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'LAB');
    const { id } = await params;
    const dto = cancelOrderSchema.parse(await req.json().catch(() => ({})));
    const order = await cancelOrder(ctx.session.userId, ctx.session.user.role, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
