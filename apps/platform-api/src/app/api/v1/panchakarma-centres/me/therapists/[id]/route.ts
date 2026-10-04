import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateTherapistSchema } from '@abies/domain/modules/panchakarma/catalogue.schemas';
import { removeTherapist, updateTherapist } from '@abies/domain/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    const dto = updateTherapistSchema.parse(await req.json());
    const therapist = await updateTherapist(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ therapist }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const { id } = await params;
    await removeTherapist(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
