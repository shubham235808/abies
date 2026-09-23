import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateAvailabilitySchema } from '@/modules/doctors/doctors.schemas';
import { removeAvailability, updateAvailability } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateAvailabilitySchema.parse(await req.json());
    const slot = await updateAvailability(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ slot }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    await removeAvailability(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
