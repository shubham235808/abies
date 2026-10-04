import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { publicProfile } from '@abies/domain/modules/doctors/doctors.service';

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    return NextResponse.json(await publicProfile(slug));
  } catch (error) {
    return errorResponse(error, req);
  }
}
