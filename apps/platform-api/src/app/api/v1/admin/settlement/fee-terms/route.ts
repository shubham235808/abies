import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createFeeTermSchema } from '@abies/domain/modules/settlement/settlement.schemas';
import { createFeeTerm, listFeeTerms } from '@abies/domain/modules/settlement/fee-terms.service';
import { applyRotatedCookie, requireMfaPermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireMfaPermission(ctx, 'settlement.manage');
    const feeTerms = await listFeeTerms();
    return applyRotatedCookie(NextResponse.json({ feeTerms }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireMfaPermission(ctx, 'settlement.manage');
    const dto = createFeeTermSchema.parse(await req.json());
    const feeTerm = await createFeeTerm(dto, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ feeTerm }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
