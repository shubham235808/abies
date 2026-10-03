import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { claimTicket } from '@abies/domain/modules/support/tickets.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR', 'ADMIN');
    const { id } = await params;
    const ticket = await claimTicket(id, ctx.session.userId, ctx.session.user.role, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ticket }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
