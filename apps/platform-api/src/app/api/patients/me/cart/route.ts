import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { addToCartSchema } from '@abies/domain/modules/medicines/cart.schemas';
import { addToCart, listMyCarts } from '@abies/domain/modules/medicines/cart.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const carts = await listMyCarts(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ carts }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = addToCartSchema.parse(await req.json());
    const cart = await addToCart(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ cart }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
