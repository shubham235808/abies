import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updatePharmacyProfileSchema } from '@abies/domain/modules/medicines/pharmacies.schemas';
import { getMyPharmacy, updateMyPharmacy } from '@abies/domain/modules/medicines/pharmacies.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const result = await getMyPharmacy(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const dto = updatePharmacyProfileSchema.parse(await req.json());
    const result = await updateMyPharmacy(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
