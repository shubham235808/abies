import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { gstRateConfigSchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { createGstRate, listGstRates } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const rates = await listGstRates();
    return applyRotatedCookie(NextResponse.json({ rates }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = gstRateConfigSchema.parse(await req.json());
    const rate = await createGstRate(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ rate }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
