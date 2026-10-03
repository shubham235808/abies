import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateStatusSchema } from '@abies/domain/modules/support/tickets.schemas';
import { updateStatus } from '@abies/domain/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = updateStatusSchema.parse(await req.json());
    const ticket = await updateStatus(id, ctx.session.userId, ctx.session.user.role, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ticket }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
