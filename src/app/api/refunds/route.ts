import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { requestRefundSchema } from '@/modules/payments/refunds.schemas';
import { requestRefund } from '@/modules/payments/refunds.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'CUSTOMER_SUPPORT', 'ADMIN');
    const dto = requestRefundSchema.parse(await req.json());
    const refund = await requestRefund(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ refund }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
