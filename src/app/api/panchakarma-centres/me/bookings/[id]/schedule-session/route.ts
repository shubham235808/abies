import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { scheduleSessionSchema } from '@/modules/panchakarma/bookings.schemas';
import { scheduleSession } from '@/modules/panchakarma/bookings.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const dto = scheduleSessionSchema.parse(await req.json());
    const result = await scheduleSession(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json(result, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
