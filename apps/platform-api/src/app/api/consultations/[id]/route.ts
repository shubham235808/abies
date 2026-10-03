import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateConsultationDetailsSchema } from '@abies/domain/modules/consultations/consultations.schemas';
import { getConsultation, updateConsultationDetails } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT', 'DOCTOR');
    const { id } = await params;
    const consultation = await getConsultation(ctx.session.userId, ctx.session.user.role, id);
    return applyRotatedCookie(NextResponse.json({ consultation }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateConsultationDetailsSchema.parse(await req.json());
    const consultation = await updateConsultationDetails(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ consultation }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
