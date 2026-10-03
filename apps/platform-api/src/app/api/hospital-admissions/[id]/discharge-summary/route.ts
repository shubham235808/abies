import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { composeDischargeSummarySchema } from '@abies/domain/modules/hospital/hospital.schemas';
import { composeDischargeSummary } from '@abies/domain/modules/hospital/admissions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = composeDischargeSummarySchema.parse(await req.json());
    const summary = await composeDischargeSummary(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ summary }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
