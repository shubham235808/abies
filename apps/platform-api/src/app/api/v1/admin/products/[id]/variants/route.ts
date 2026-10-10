import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createProductVariant, createProductVariantSchema } from '@abies/domain/modules/medicines/admin-products.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = createProductVariantSchema.parse(await req.json());
    const variant = await createProductVariant(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ variant }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
