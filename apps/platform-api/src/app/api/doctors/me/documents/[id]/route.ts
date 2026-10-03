import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { removeDocument } from '@abies/domain/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    await removeDocument(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
