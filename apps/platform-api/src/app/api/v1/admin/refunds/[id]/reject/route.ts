import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { rejectRefundSchema } from '@abies/domain/modules/payments/refunds.schemas';
import { rejectRefund } from '@abies/domain/modules/payments/refunds.service';
import { applyRotatedCookie, requireMfaPermission, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireMfaPermission(ctx, 'settlement.manage');
    const { id } = await params;
    const dto = rejectRefundSchema.parse(await req.json().catch(() => ({})));
    const refund = await rejectRefund(ctx.session.userId, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ refund }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
