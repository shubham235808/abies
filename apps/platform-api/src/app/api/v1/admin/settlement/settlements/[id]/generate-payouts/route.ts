import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { generatePayouts } from '@abies/domain/modules/settlement/settlements.service';
import { applyRotatedCookie, requireMfaPermission, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireMfaPermission(ctx, 'settlement.manage');
    const { id } = await params;
    const payouts = await generatePayouts(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ payouts }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
