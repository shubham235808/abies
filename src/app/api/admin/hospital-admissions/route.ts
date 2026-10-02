import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { admitPatientSchema } from '@/modules/hospital/hospital.schemas';
import { admitPatient } from '@/modules/hospital/admissions.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const dto = admitPatientSchema.parse(await req.json());
    const admission = await admitPatient(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ admission }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
