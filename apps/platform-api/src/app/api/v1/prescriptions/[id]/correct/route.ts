import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { correctPrescription } from '@abies/domain/modules/consultations/prescriptions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const prescription = await correctPrescription(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ prescription }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
