import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateClinicSchema } from '@/modules/doctors/doctors.schemas';
import { removeClinic, updateClinic } from '@/modules/doctors/doctors.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = updateClinicSchema.parse(await req.json());
    const clinic = await updateClinic(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ clinic }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    await removeClinic(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
