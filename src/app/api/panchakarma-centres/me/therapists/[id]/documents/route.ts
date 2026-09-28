import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@/lib/errors';
import { therapistDocumentTypeSchema } from '@/modules/panchakarma/catalogue.schemas';
import { addTherapistDocument, listTherapistDocuments } from '@/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const documents = await listTherapistDocuments(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ documents }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;

    const formData = await req.formData();
    const type = therapistDocumentTypeSchema.parse(formData.get('type'));
    const file = formData.get('file');
    if (!(file instanceof File)) throw new BadRequestError('Document file is required');

    const document = await addTherapistDocument(
      ctx.session.userId,
      id,
      type,
      {
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      },
      { userId: ctx.session.userId, ...ctx },
    );
    return applyRotatedCookie(NextResponse.json({ document }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
