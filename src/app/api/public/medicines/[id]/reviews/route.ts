import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { listForMedicine } from '@/modules/reviews/reviews.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reviews = await listForMedicine(id);
    return NextResponse.json({ reviews });
  } catch (error) {
    return errorResponse(error);
  }
}
