import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateInventorySchema } from '@/modules/medicines/catalogue.schemas';
import { removeInventory, updateInventory } from '@/modules/medicines/catalogue.service';
import { applyRotatedCookie, requirePermission, requireRole, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    requirePermission(ctx, 'pharmacy.product.update');
    const { id } = await params;
    const dto = updateInventorySchema.parse(await req.json());
    const item = await updateInventory(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ item }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const { id } = await params;
    await removeInventory(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
