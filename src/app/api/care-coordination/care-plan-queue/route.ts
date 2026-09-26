import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listAtRiskItems } from '@/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'CARE_COORDINATOR', 'ADMIN');
    const items = await listAtRiskItems();
    return applyRotatedCookie(NextResponse.json({ items }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
