import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { cancelOrderSchema } from '@abies/domain/modules/medicines/orders.schemas';
import { cancelOrder } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'PHARMACY');
    const { id } = await params;
    const dto = cancelOrderSchema.parse(await req.json().catch(() => ({})));
    const order = await cancelOrder(ctx.session.userId, ctx.session.user.role, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
