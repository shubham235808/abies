import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { rejectOrSuspendCentreSchema } from '@abies/domain/modules/panchakarma/centres.schemas';
import { reject } from '@abies/domain/modules/panchakarma/admin-centres.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const { reason } = rejectOrSuspendCentreSchema.parse(await req.json());
    const result = await reject(id, { userId: ctx.session.userId, ...ctx }, reason);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
