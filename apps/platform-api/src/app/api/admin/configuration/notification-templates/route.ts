import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { notificationTemplateSchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { createNotificationTemplate, listNotificationTemplates } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const templates = await listNotificationTemplates();
    return applyRotatedCookie(NextResponse.json({ templates }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = notificationTemplateSchema.parse(await req.json());
    const template = await createNotificationTemplate(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ template }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
