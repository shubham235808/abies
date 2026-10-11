import { errorResponse } from '@abies/domain/lib/errors';
import { objectResponse } from '@abies/domain/lib/storage';
import { publishedBlogPostCover } from '@abies/domain/modules/content/blog.service';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { storageKey } = await publishedBlogPostCover(slug);
    return await objectResponse(storageKey, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
