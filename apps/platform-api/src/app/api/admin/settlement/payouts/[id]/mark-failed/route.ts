import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { markPayoutFailedSchema } from '@abies/domain/modules/settlement/settlement.schemas';
import { markPayoutFailed } from '@abies/domain/modules/settlement/settlements.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const { id } = await params;
    const dto = markPayoutFailedSchema.parse(await req.json());
    const payout = await markPayoutFailed(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ payout }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
