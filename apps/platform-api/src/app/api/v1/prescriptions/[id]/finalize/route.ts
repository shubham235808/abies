import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { finalizePrescription } from '@abies/domain/modules/consultations/prescriptions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const prescription = await finalizePrescription(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ prescription }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
