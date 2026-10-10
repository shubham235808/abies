import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { updatePageSeoSchema } from '@abies/domain/modules/content/seo.schemas';
import { getPageSeo, removePageSeo, updatePageSeo } from '@abies/domain/modules/content/seo.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const entry = await getPageSeo(id);
    return applyRotatedCookie(NextResponse.json({ entry }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = updatePageSeoSchema.parse(JSON.parse(payload));

    const ogImageEntry = formData.get('ogImage');
    const ogImage = ogImageEntry instanceof File
      ? { originalName: ogImageEntry.name, mimeType: ogImageEntry.type, size: ogImageEntry.size, buffer: Buffer.from(await ogImageEntry.arrayBuffer()) }
      : null;

    const entry = await updatePageSeo(id, dto, ogImage, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ entry }), ctx);
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
    await removePageSeo(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
