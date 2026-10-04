import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { addLeadDocument } from '@abies/domain/modules/partners/leads.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new BadRequestError('A document file is required');

    const lead = await addLeadDocument(
      id,
      ctx.session.userId,
      { originalName: file.name, mimeType: file.type, size: file.size, buffer: Buffer.from(await file.arrayBuffer()) },
      { userId: ctx.session.userId, ...ctx },
    );
    return applyRotatedCookie(NextResponse.json({ lead }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
