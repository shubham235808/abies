import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { posSaleSchema } from '@abies/domain/modules/medicines/pharmacies.schemas';
import { listMySales, recordSale } from '@abies/domain/modules/medicines/pos.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const sales = await listMySales(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ sales }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const dto = posSaleSchema.parse(await req.json());
    const sale = await recordSale(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ sale }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
