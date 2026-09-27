import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { rejectRefundSchema } from '@/modules/payments/refunds.schemas';
import { rejectRefund } from '@/modules/payments/refunds.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = rejectRefundSchema.parse(await req.json().catch(() => ({})));
    const refund = await rejectRefund(ctx.session.userId, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ refund }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
