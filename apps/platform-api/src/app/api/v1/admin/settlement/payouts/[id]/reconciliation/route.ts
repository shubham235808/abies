import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { recordReconciliationSchema } from '@abies/domain/modules/settlement/settlement.schemas';
import { recordReconciliation } from '@abies/domain/modules/settlement/settlements.service';
import { applyRotatedCookie, requireMfaPermission, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireMfaPermission(ctx, 'settlement.manage');
    const { id } = await params;
    const dto = recordReconciliationSchema.parse(await req.json());
    const reconciliation = await recordReconciliation(id, dto, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ reconciliation }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
