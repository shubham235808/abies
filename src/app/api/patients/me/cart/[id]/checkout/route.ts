import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { checkoutCartSchema } from '@/modules/medicines/cart.schemas';
import { checkoutCart } from '@/modules/medicines/cart.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = checkoutCartSchema.parse(await req.json());
    const result = await checkoutCart(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json(result, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
