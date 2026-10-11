import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { listMediaSchema } from '@abies/domain/modules/media/media.schemas';
import { listMediaAssets, uploadMediaAsset } from '@abies/domain/modules/media/media.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const query = listMediaSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const result = await listMediaAssets(query);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

// multipart/form-data with a single `file` field — image or video.
export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');

    const formData = await req.formData();
    const entry = formData.get('file');
    if (!(entry instanceof File)) throw new BadRequestError('Missing file');
    const file = { originalName: entry.name, mimeType: entry.type, size: entry.size, buffer: Buffer.from(await entry.arrayBuffer()) };

    const asset = await uploadMediaAsset(file, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ asset }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
