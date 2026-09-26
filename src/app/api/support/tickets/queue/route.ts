import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/errors';
import { listQueue } from '@/modules/support/tickets.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

const querySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED', 'CLOSED']).optional(),
});

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR', 'ADMIN');
    const url = new URL(req.url);
    const { status } = querySchema.parse(Object.fromEntries(url.searchParams));
    const tickets = await listQueue(ctx.session.user.role, status);
    return applyRotatedCookie(NextResponse.json({ tickets }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
