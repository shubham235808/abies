import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { adminLabQueueQuerySchema } from '@/modules/diagnostics/labs.schemas';
import { queue } from '@/modules/diagnostics/admin-labs.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = adminLabQueueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await queue(status);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
