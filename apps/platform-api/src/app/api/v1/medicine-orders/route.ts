import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { bookOrderSchema } from '@abies/domain/modules/medicines/orders.schemas';
import { bookOrder } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';
import { withIdempotency } from '@abies/domain/server/idempotency';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = bookOrderSchema.parse(await req.json());
    const { status, body } = await withIdempotency(
      ctx.session.userId,
      'medicine-orders',
      req.headers.get('idempotency-key'),
      async () => ({ status: 201, body: await bookOrder(ctx.session.userId, dto) }),
    );
    return applyRotatedCookie(NextResponse.json(body, { status }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
