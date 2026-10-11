import { errorResponse } from '@abies/domain/lib/errors';
import { objectResponse } from '@abies/domain/lib/storage';
import { publicTestimonialPhoto } from '@abies/domain/modules/content/testimonials.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { storageKey } = await publicTestimonialPhoto(id);
    return await objectResponse(storageKey, { cacheControl: 'public, max-age=3600' });
  } catch (error) {
    return errorResponse(error, req);
  }
}
