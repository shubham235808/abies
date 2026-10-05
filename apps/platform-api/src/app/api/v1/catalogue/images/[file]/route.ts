import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { catalogueImageKey } from '@abies/domain/modules/medicines/admin-products.service';
import { getObjectBytes } from '@abies/domain/lib/storage';

// Public product images (catalogue photos are marketing content, not private
// documents). Only catalogue/<id>.<ext> can be read through this route.
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await params;
    const { body, contentType } = await getObjectBytes(catalogueImageKey(file));
    return new NextResponse(body as BodyInit, {
      headers: {
        'content-type': contentType ?? 'application/octet-stream',
        'cache-control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return errorResponse(error, req);
  }
}
