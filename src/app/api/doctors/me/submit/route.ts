import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { submitApplicationSchema } from '@/modules/doctors/doctors.schemas';
import { submit } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const dto = submitApplicationSchema.parse(await req.json());
    const result = await submit(ctx.session.userId, dto.declarationAccepted, {
      userId: ctx.session.userId,
      ...ctx,
    });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
