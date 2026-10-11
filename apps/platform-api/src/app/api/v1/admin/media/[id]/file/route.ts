import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { getMediaAsset, mediaFileResponse } from '@abies/domain/modules/media/media.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

// The library browser's thumbnails and previews. Private cache only: the
// response is behind an admin session.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    const asset = await getMediaAsset(id);
    const res = await mediaFileResponse(asset, req.headers.get('range'), 'private, max-age=300');
    return applyRotatedCookie(new NextResponse(res.body, { status: res.status, headers: res.headers }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
