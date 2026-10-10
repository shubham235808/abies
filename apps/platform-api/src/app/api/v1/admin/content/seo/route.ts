import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { createPageSeoSchema } from '@abies/domain/modules/content/seo.schemas';
import { createPageSeo, listPageSeo } from '@abies/domain/modules/content/seo.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const entries = await listPageSeo();
    return applyRotatedCookie(NextResponse.json({ entries }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = createPageSeoSchema.parse(JSON.parse(payload));

    const ogImageEntry = formData.get('ogImage');
    const ogImage = ogImageEntry instanceof File
      ? { originalName: ogImageEntry.name, mimeType: ogImageEntry.type, size: ogImageEntry.size, buffer: Buffer.from(await ogImageEntry.arrayBuffer()) }
      : null;

    const entry = await createPageSeo(dto, ogImage, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ entry }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
