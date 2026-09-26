import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { reactivateStaff } from '@/modules/staff/staff.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const staffProfile = await reactivateStaff(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ staffProfile }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
