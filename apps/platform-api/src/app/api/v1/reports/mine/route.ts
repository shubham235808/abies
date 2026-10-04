import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listMineAsPatient } from '@abies/domain/modules/diagnostics/reports.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const reports = await listMineAsPatient(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ reports }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
