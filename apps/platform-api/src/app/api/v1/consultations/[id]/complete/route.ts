import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateConsultationDetailsSchema } from '@abies/domain/modules/consultations/consultations.schemas';
import { completeConsultation } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateConsultationDetailsSchema.parse(await req.json().catch(() => ({})));
    const consultation = await completeConsultation(ctx.session.userId, id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ consultation }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
