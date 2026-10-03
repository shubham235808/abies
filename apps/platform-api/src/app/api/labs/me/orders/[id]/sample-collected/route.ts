import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { sampleCollectedSchema } from '@abies/domain/modules/diagnostics/orders.schemas';
import { markSampleCollected } from '@abies/domain/modules/diagnostics/orders.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;
    const dto = sampleCollectedSchema.parse(await req.json().catch(() => ({})));
    const order = await markSampleCollected(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ order }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
