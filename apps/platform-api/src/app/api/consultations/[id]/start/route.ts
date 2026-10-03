import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { startConsultation } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const consultation = await startConsultation(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ consultation }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
