import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { triageTicketSchema } from '@/modules/support/tickets.schemas';
import { triageTicket } from '@/modules/support/tickets.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR', 'ADMIN');
    const { id } = await params;
    const dto = triageTicketSchema.parse(await req.json());
    const ticket = await triageTicket(id, ctx.session.user.role, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ticket }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
