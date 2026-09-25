import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listFinalizedPrescriptionsForPatient } from '@/modules/medicines/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const prescriptions = await listFinalizedPrescriptionsForPatient(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ prescriptions }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
