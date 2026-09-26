import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { claimLead } from '@/modules/partners/leads.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const { id } = await params;
    const lead = await claimLead(id, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
