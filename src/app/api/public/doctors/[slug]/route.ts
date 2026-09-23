import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { publicProfile } from '@/modules/doctors/doctors.service';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    return NextResponse.json(await publicProfile(slug));
  } catch (error) {
    return errorResponse(error);
  }
}
