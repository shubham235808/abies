import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateFamilyMemberSchema } from '@abies/domain/modules/patients/patients.schemas';
import { removeFamilyMember, updateFamilyMember } from '@abies/domain/modules/patients/patients.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = updateFamilyMemberSchema.parse(await req.json());
    const member = await updateFamilyMember(ctx.session.userId, id, dto, {
      userId: ctx.session.userId,
      ...ctx,
    });
    return applyRotatedCookie(NextResponse.json({ member }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    await removeFamilyMember(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
