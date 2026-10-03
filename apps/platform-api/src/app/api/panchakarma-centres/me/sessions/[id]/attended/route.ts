import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { markSessionAttendedSchema } from '@abies/domain/modules/panchakarma/bookings.schemas';
import { markSessionAttended } from '@abies/domain/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const dto = markSessionAttendedSchema.parse(await req.json().catch(() => ({})));
    const result = await markSessionAttended(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
