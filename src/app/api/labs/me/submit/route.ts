import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { submitLabApplicationSchema } from '@/modules/diagnostics/labs.schemas';
import { submitLab } from '@/modules/diagnostics/labs.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

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
