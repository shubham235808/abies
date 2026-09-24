import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listMineAsPatient } from '@/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const carePlans = await listMineAsPatient(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ carePlans }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
