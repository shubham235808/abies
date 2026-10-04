import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateNotificationTemplateSchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { removeNotificationTemplate, updateNotificationTemplate } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    const dto = updateNotificationTemplateSchema.parse(await req.json());
    const template = await updateNotificationTemplate(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ template }), ctx);
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
    await removeNotificationTemplate(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
