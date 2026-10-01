import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createSettlementSchema } from '@/modules/settlement/settlement.schemas';
import { createSettlement, listSettlements } from '@/modules/settlement/settlements.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const settlements = await listSettlements();
    return applyRotatedCookie(NextResponse.json({ settlements }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const dto = createSettlementSchema.parse(await req.json());
    const settlement = await createSettlement(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ settlement }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
