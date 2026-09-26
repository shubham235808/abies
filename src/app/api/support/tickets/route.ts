import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createTicketSchema } from '@/modules/support/tickets.schemas';
import { createTicket, listMineAsRequester } from '@/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const tickets = await listMineAsRequester(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ tickets }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    const dto = createTicketSchema.parse(await req.json());
    const ticket = await createTicket(ctx.session.userId, ctx.session.user.role, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ticket }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
