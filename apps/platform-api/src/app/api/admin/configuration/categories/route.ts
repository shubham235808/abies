import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { configCategorySchema } from '@abies/domain/modules/configuration/configuration.schemas';
import { createConfigCategory, listConfigCategories } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const domain = new URL(req.url).searchParams.get('domain') ?? undefined;
    const categories = await listConfigCategories(domain);
    return applyRotatedCookie(NextResponse.json({ categories }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = configCategorySchema.parse(await req.json());
    const category = await createConfigCategory(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ category }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
