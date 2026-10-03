import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createFacilitySchema } from '@abies/domain/modules/hospital/hospital.schemas';
import { createFacility, listFacilities } from '@abies/domain/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const facilities = await listFacilities();
    return applyRotatedCookie(NextResponse.json({ facilities }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const dto = createFacilitySchema.parse(await req.json());
    const facility = await createFacility(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ facility }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
