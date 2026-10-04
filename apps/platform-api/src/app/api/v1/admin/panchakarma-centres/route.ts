import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { adminCentreQueueQuerySchema } from '@abies/domain/modules/panchakarma/centres.schemas';
import { queue } from '@abies/domain/modules/panchakarma/admin-centres.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = adminCentreQueueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await queue(status);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
