import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { bookTherapySchema } from '@/modules/panchakarma/bookings.schemas';
import { bookTherapy } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
