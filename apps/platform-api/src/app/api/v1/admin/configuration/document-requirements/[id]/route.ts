import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateDocumentRequirementSchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { removeDocumentRequirement, updateDocumentRequirement } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    const dto = updateDocumentRequirementSchema.parse(await req.json());
    const requirement = await updateDocumentRequirement(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ requirement }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    await removeDocumentRequirement(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
