import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { serviceLocationSchema } from '@/modules/configuration/configuration.schemas';
import { createServiceLocation, listServiceLocations } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const locations = await listServiceLocations();
    return applyRotatedCookie(NextResponse.json({ locations }), ctx);
  } catch (error) {
    return errorResponse(error);
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
    return errorResponse(error);
  }
}
