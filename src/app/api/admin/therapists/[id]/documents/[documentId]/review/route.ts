import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { therapistDocumentReviewSchema } from '@/modules/panchakarma/catalogue.schemas';
import { reviewDocument } from '@/modules/panchakarma/admin-therapists.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id, documentId } = await params;
    const { outcome, note } = therapistDocumentReviewSchema.parse(await req.json());
    const result = await reviewDocument(id, documentId, { userId: ctx.session.userId, ...ctx }, outcome, note);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
