import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { createBlogPostSchema } from '@abies/domain/modules/content/blog.schemas';
import { createBlogPost, listBlogPosts } from '@abies/domain/modules/content/blog.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const posts = await listBlogPosts();
    return applyRotatedCookie(NextResponse.json({ posts }), ctx);
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
    const dto = createBlogPostSchema.parse(JSON.parse(payload));

    const coverEntry = formData.get('coverImage');
    const coverImage = coverEntry instanceof File
      ? { originalName: coverEntry.name, mimeType: coverEntry.type, size: coverEntry.size, buffer: Buffer.from(await coverEntry.arrayBuffer()) }
      : null;

    const post = await createBlogPost(dto, coverImage, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ post }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
