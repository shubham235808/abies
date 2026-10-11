import { errorResponse } from '@abies/domain/lib/errors';
import { objectResponse } from '@abies/domain/lib/storage';
import { publicPhotoDownloadUrl } from '@abies/domain/modules/doctors/doctors.service';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { storageKey } = await publicPhotoDownloadUrl(slug);
    return await objectResponse(storageKey, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
