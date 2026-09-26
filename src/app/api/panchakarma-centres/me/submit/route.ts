import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { submitCentreApplicationSchema } from '@/modules/panchakarma/centres.schemas';
import { submitCentre } from '@/modules/panchakarma/centres.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const dto = submitCentreApplicationSchema.parse(await req.json());
    const result = await submitCentre(ctx.session.userId, dto.declarationAccepted, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
