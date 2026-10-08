import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { bookTherapySchema } from '@abies/domain/modules/panchakarma/bookings.schemas';
import { bookTherapy } from '@abies/domain/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';
import { withIdempotency } from '@abies/domain/server/idempotency';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = bookTherapySchema.parse(await req.json());
    const { status, body } = await withIdempotency(
      ctx.session.userId,
      'panchakarma-bookings',
      req.headers.get('idempotency-key'),
      async () => ({ status: 201, body: await bookTherapy(ctx.session.userId, dto) }),
    );
    return applyRotatedCookie(NextResponse.json(body, { status }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
