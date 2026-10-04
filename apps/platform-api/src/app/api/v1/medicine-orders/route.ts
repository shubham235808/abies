import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { bookOrderSchema } from '@abies/domain/modules/medicines/orders.schemas';
import { bookOrder } from '@abies/domain/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = bookOrderSchema.parse(await req.json());
    const result = await bookOrder(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json(result, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
