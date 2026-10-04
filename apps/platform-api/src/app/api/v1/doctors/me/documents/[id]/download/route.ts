import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getDocumentDownloadUrl } from '@abies/domain/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

// Returns a short-lived signed URL rather than proxying the file — never a
// permanent public link (docs/SECURITY-MODEL.md).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const url = await getDocumentDownloadUrl(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
