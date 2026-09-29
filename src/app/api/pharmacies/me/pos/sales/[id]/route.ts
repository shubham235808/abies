import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { getSale } from '@/modules/medicines/pos.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const { id } = await params;
    const sale = await getSale(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ sale }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
