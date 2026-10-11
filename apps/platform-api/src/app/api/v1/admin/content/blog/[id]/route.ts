import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { updateBlogPostSchema } from '@abies/domain/modules/content/blog.schemas';
import { getBlogPost, removeBlogPost, updateBlogPost } from '@abies/domain/modules/content/blog.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const post = await getBlogPost(id);
    return applyRotatedCookie(NextResponse.json({ post }), ctx);
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
    const dto = updateBlogPostSchema.parse(JSON.parse(payload));

    const coverEntry = formData.get('coverImage');
    const coverImage = coverEntry instanceof File
      ? { originalName: coverEntry.name, mimeType: coverEntry.type, size: coverEntry.size, buffer: Buffer.from(await coverEntry.arrayBuffer()) }
      : null;

    const post = await updateBlogPost(id, dto, coverImage, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ post }), ctx);
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
    await removeBlogPost(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
