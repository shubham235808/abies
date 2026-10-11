import { errorResponse } from '@abies/domain/lib/errors';
import { objectResponse } from '@abies/domain/lib/storage';
import { publicPageSeoOgImage } from '@abies/domain/modules/content/seo.service';

export async function GET(req: Request, { params }: { params: Promise<{ pageKey: string }> }) {
  try {
    const { pageKey } = await params;
    const { storageKey } = await publicPageSeoOgImage(pageKey);
    // Crawlers fetch og:image well after the page itself, often queued —
    // cache longer than the usual 1h, same reasoning the old signed-URL TTL
    // (24h) used, now expressed as a cache header instead.
    return await objectResponse(storageKey, { cacheControl: 'public, max-age=86400' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
