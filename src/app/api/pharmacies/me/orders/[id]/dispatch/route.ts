import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { dispatchOrderSchema } from '@/modules/medicines/orders.schemas';
import { dispatchOrder } from '@/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const { id } = await params;
    const dto = dispatchOrderSchema.parse(await req.json().catch(() => ({})));
    const order = await dispatchOrder(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
