import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import {
  removeProductVariant,
  updateProductVariant,
  updateProductVariantSchema,
} from '@abies/domain/modules/medicines/admin-products.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id, variantId } = await params;
    const dto = updateProductVariantSchema.parse(await req.json());
    const variant = await updateProductVariant(id, variantId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ variant }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id, variantId } = await params;
    await removeProductVariant(id, variantId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
