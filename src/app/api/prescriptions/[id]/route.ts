import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { savePrescriptionSchema } from '@/modules/consultations/consultations.schemas';
import { updatePrescription } from '@/modules/consultations/prescriptions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = savePrescriptionSchema.parse(await req.json());
    const prescription = await updatePrescription(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ prescription }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
