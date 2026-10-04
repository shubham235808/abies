import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { submitPharmacyApplicationSchema } from '@abies/domain/modules/medicines/pharmacies.schemas';
import { submitPharmacy } from '@abies/domain/modules/medicines/pharmacies.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const dto = submitPharmacyApplicationSchema.parse(await req.json());
    const result = await submitPharmacy(ctx.session.userId, dto.declarationAccepted, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
