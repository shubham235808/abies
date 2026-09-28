import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { removeTherapistDocument } from '@/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id, documentId } = await params;
    await removeTherapistDocument(ctx.session.userId, id, documentId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
