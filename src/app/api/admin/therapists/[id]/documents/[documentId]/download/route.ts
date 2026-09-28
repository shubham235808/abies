import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { documentDownloadUrl } from '@/modules/panchakarma/admin-therapists.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id, documentId } = await params;
    const url = await documentDownloadUrl(id, documentId);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
