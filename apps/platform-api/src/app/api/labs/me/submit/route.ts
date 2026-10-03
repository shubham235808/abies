import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { submitLabApplicationSchema } from '@abies/domain/modules/diagnostics/labs.schemas';
import { submitLab } from '@abies/domain/modules/diagnostics/labs.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const dto = submitLabApplicationSchema.parse(await req.json());
    const result = await submitLab(ctx.session.userId, dto.declarationAccepted, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
