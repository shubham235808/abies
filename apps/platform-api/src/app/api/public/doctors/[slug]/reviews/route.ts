import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listForDoctorBySlug } from '@abies/domain/modules/reviews/reviews.service';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const reviews = await listForDoctorBySlug(slug);
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
}
