import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { adminPharmacyQueueQuerySchema } from '@abies/domain/modules/medicines/pharmacies.schemas';
import { queue } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = adminPharmacyQueueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await queue(status);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
