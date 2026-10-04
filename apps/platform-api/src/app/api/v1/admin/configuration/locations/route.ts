import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { serviceLocationSchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { createServiceLocation, listServiceLocations } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const locations = await listServiceLocations();
    return applyRotatedCookie(NextResponse.json({ locations }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = serviceLocationSchema.parse(await req.json());
    const location = await createServiceLocation(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ location }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
