import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { upsertAboutPageSchema } from '@abies/domain/modules/content/about.schemas';
import { getAboutPage, upsertAboutPage } from '@abies/domain/modules/content/about.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const page = await getAboutPage();
    return applyRotatedCookie(NextResponse.json({ page }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

// Upsert, not create+update — a singleton page has no "not created yet"
// error state the admin editor should ever have to handle.
export async function PUT(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = upsertAboutPageSchema.parse(await req.json());
    const page = await upsertAboutPage(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ page }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
