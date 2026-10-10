import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createContentPageSchema } from '@abies/domain/modules/content/pages.schemas';
import { createContentPage, listContentPages } from '@abies/domain/modules/content/pages.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const pages = await listContentPages();
    return applyRotatedCookie(NextResponse.json({ pages }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = createContentPageSchema.parse(await req.json());
    const page = await createContentPage(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ page }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
