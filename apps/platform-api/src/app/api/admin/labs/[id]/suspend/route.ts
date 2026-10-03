import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { rejectOrSuspendLabSchema } from '@abies/domain/modules/diagnostics/labs.schemas';
import { suspend } from '@abies/domain/modules/diagnostics/admin-labs.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const { reason } = rejectOrSuspendLabSchema.parse(await req.json());
    const result = await suspend(id, { userId: ctx.session.userId, ...ctx }, reason);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
