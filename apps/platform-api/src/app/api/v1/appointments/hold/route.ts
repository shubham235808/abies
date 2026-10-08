import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { holdSlotSchema } from '@abies/domain/modules/appointments/appointments.schemas';
import { holdSlot } from '@abies/domain/modules/appointments/appointments.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';
import { withIdempotency } from '@abies/domain/server/idempotency';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = holdSlotSchema.parse(await req.json());
    const { status, body } = await withIdempotency(
      ctx.session.userId,
      'appointments.hold',
      req.headers.get('idempotency-key'),
      async () => ({ status: 201, body: await holdSlot(ctx.session.userId, dto) }),
    );
    return applyRotatedCookie(NextResponse.json(body, { status }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
