import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updatePackageSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';
import { removePackage, updatePackage } from '@abies/domain/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;
    const dto = updatePackageSchema.parse(await req.json());
    const diagnosticPackage = await updatePackage(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ package: diagnosticPackage }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;
    await removePackage(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
