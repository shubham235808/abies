import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { acknowledgeReport } from '@/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
