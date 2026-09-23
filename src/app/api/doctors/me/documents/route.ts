import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@/lib/errors';
import { doctorDocumentTypeSchema } from '@/modules/doctors/doctors.schemas';
import { addDocument, listDocuments } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const documents = await listDocuments(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ documents }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');

    const formData = await req.formData();
    const type = doctorDocumentTypeSchema.parse(formData.get('type'));
    const file = formData.get('file');
    if (!(file instanceof File)) throw new BadRequestError('Document file is required');

    const document = await addDocument(
      ctx.session.userId,
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
