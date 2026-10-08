import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { checkoutCartSchema } from '@abies/domain/modules/medicines/cart.schemas';
import { checkoutCart } from '@abies/domain/modules/medicines/cart.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';
import { withIdempotency } from '@abies/domain/server/idempotency';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = checkoutCartSchema.parse(await req.json());
    const { status, body } = await withIdempotency(
      ctx.session.userId,
      `cart.checkout.${id}`,
      req.headers.get('idempotency-key'),
      async () => ({ status: 201, body: await checkoutCart(ctx.session.userId, id, dto) }),
    );
    return applyRotatedCookie(NextResponse.json(body, { status }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
