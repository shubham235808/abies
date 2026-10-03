import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { verifyOrderPaymentSchema } from '@abies/domain/modules/medicines/orders.schemas';
import { verifyOrderPayment } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

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
