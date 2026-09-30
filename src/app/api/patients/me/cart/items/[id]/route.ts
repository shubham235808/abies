import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateCartItemSchema } from '@/modules/medicines/cart.schemas';
import { removeCartItem, updateCartItem } from '@/modules/medicines/cart.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = updateCartItemSchema.parse(await req.json());
    const cart = await updateCartItem(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ cart }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const cart = await removeCartItem(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ cart }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
