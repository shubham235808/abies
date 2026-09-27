import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { approveRefund } from '@/modules/payments/refunds.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const refund = await approveRefund(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ refund }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
