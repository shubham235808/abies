import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { taxSettingsSchema } from '@/modules/medicines/pharmacies.schemas';
import { getMyTaxSettings, upsertMyTaxSettings } from '@/modules/medicines/pharmacies.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const settings = await getMyTaxSettings(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ settings }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const dto = taxSettingsSchema.parse(await req.json());
    const settings = await upsertMyTaxSettings(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ settings }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
