import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { addInventorySchema } from '@abies/domain/modules/medicines/catalogue.schemas';
import { addInventory, listMyInventory } from '@abies/domain/modules/medicines/catalogue.service';
import { applyRotatedCookie, requirePermission, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    const inventory = await listMyInventory(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ inventory }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PHARMACY');
    requirePermission(ctx, 'pharmacy.product.create');
    const dto = addInventorySchema.parse(await req.json());
    const item = await addInventory(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ item }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
