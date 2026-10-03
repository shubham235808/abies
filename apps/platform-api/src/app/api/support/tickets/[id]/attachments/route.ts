import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { addAttachment } from '@abies/domain/modules/support/tickets.service';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new BadRequestError('An attachment file is required');
    const messageId = formData.get('messageId');

    const attachment = await addAttachment(
      id,
      ctx.session.userId,
      ctx.session.user.role,
      {
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
      typeof messageId === 'string' ? messageId : undefined,
    );
    return applyRotatedCookie(NextResponse.json({ attachment }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
