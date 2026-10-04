import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { publicPhotoDownloadUrl } from '@abies/domain/modules/doctors/doctors.service';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const url = await publicPhotoDownloadUrl(slug);
    return NextResponse.redirect(url);
  } catch (error) {
    return errorResponse(error, req);
  }
}
