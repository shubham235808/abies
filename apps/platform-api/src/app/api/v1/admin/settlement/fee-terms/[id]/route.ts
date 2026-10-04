import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateFeeTermSchema } from '@abies/domain/modules/settlement/settlement.schemas';
import { removeFeeTerm, updateFeeTerm } from '@abies/domain/modules/settlement/fee-terms.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const { id } = await params;
    const dto = updateFeeTermSchema.parse(await req.json());
    const feeTerm = await updateFeeTerm(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ feeTerm }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'settlement.manage');
    const { id } = await params;
    await removeFeeTerm(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
