import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateNotificationTemplateSchema } from '@/modules/configuration/configuration.schemas';
import { removeNotificationTemplate, updateNotificationTemplate } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = updateNotificationTemplateSchema.parse(await req.json());
    const template = await updateNotificationTemplate(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ template }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    await removeNotificationTemplate(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
