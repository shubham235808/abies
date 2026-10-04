import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { addMessageSchema } from '@abies/domain/modules/support/tickets.schemas';
import { addMessage } from '@abies/domain/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = addMessageSchema.parse(await req.json());
    const message = await addMessage(id, ctx.session.userId, ctx.session.user.role, dto.body, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ message }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
