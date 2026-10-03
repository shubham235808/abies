import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@abies/domain/lib/errors';
import { listQueue } from '@abies/domain/modules/payments/refunds.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

const querySchema = z.object({
  status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED']).optional(),
});

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = querySchema.parse(Object.fromEntries(url.searchParams));
    const refunds = await listQueue(status);
    return applyRotatedCookie(NextResponse.json({ refunds }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
