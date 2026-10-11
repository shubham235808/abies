import { errorResponse } from '@abies/domain/lib/errors';
import { publicTestimonialVideo } from '@abies/domain/modules/content/testimonials.service';
import { mediaFileResponse } from '@abies/domain/modules/media/media.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const video = await publicTestimonialVideo(id);
    return await mediaFileResponse(video, req.headers.get('range'), 'public, max-age=3600');
  } catch (error) {
    return errorResponse(error, req);
  }
}
