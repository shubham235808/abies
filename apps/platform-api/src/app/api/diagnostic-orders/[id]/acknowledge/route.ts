import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { acknowledgeReport } from '@abies/domain/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const report = await acknowledgeReport(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ report }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
