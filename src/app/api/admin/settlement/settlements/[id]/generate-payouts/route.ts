import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { generatePayouts } from '@/modules/settlement/settlements.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const { id } = await params;
    const payouts = await generatePayouts(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ payouts }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
