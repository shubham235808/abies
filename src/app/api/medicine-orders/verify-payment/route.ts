import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { verifyOrderPaymentSchema } from '@/modules/medicines/orders.schemas';
import { verifyOrderPayment } from '@/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = verifyOrderPaymentSchema.parse(await req.json());
    const order = await verifyOrderPayment(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
