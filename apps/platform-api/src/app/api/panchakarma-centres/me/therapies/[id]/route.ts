import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateTherapySchema } from '@abies/domain/modules/panchakarma/catalogue.schemas';
import { removeTherapy, updateTherapy } from '@abies/domain/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const dto = updateTherapySchema.parse(await req.json());
    const therapy = await updateTherapy(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ therapy }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    await removeTherapy(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
