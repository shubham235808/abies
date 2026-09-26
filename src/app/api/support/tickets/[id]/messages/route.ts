import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { addMessageSchema } from '@/modules/support/tickets.schemas';
import { addMessage } from '@/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = addMessageSchema.parse(await req.json());
    const message = await addMessage(id, ctx.session.userId, ctx.session.user.role, dto.body, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ message }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
