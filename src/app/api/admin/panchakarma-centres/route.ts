import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { adminCentreQueueQuerySchema } from '@/modules/panchakarma/centres.schemas';
import { queue } from '@/modules/panchakarma/admin-centres.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = adminCentreQueueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await queue(status);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
