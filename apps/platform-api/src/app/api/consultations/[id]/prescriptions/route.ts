import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { savePrescriptionSchema } from '@abies/domain/modules/consultations/consultations.schemas';
import { createPrescription } from '@abies/domain/modules/consultations/prescriptions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = savePrescriptionSchema.parse(await req.json());
    const prescription = await createPrescription(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ prescription }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
