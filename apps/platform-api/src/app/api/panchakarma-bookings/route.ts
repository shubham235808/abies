import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { bookTherapySchema } from '@abies/domain/modules/panchakarma/bookings.schemas';
import { bookTherapy } from '@abies/domain/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = bookTherapySchema.parse(await req.json());
    const result = await bookTherapy(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json(result, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
