import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { publicPhotoDownloadUrl } from '@/modules/doctors/doctors.service';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const url = await publicPhotoDownloadUrl(slug);
    return NextResponse.redirect(url);
  } catch (error) {
    return errorResponse(error);
  }
}
