import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { dischargeAdmission } from '@/modules/hospital/admissions.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const { id } = await params;
    const admission = await dischargeAdmission(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ admission }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
