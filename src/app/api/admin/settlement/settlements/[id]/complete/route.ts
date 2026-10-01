import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { completeSettlement } from '@/modules/settlement/settlements.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const { id } = await params;
    const settlement = await completeSettlement(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ settlement }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
