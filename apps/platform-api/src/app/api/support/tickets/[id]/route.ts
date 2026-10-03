import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getTicket } from '@abies/domain/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const ticket = await getTicket(id, ctx.session.userId, ctx.session.user.role);
    return applyRotatedCookie(NextResponse.json({ ticket }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
