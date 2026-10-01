import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createFeeTermSchema } from '@/modules/settlement/settlement.schemas';
import { createFeeTerm, listFeeTerms } from '@/modules/settlement/fee-terms.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const feeTerms = await listFeeTerms();
    return applyRotatedCookie(NextResponse.json({ feeTerms }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const dto = createFeeTermSchema.parse(await req.json());
    const feeTerm = await createFeeTerm(dto, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ feeTerm }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
