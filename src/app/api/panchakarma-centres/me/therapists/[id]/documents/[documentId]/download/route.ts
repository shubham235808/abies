import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getTherapistDocumentDownloadUrl } from '@/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id, documentId } = await params;
    const url = await getTherapistDocumentDownloadUrl(ctx.session.userId, id, documentId);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
