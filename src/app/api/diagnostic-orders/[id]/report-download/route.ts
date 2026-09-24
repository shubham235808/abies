import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getReportDownloadUrlForDoctor } from '@/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const url = await getReportDownloadUrlForDoctor(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ url }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
