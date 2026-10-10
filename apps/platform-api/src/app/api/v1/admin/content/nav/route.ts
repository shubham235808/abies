import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createNavMenuItemSchema } from '@abies/domain/modules/content/nav.schemas';
import { createNavMenuItem, listNavMenuItems } from '@abies/domain/modules/content/nav.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const items = await listNavMenuItems();
    return applyRotatedCookie(NextResponse.json({ items }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = createNavMenuItemSchema.parse(await req.json());
    const item = await createNavMenuItem(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ item }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
