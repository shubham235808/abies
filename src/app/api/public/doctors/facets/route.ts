import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { facets } from '@/modules/doctors/doctors.service';

export async function GET() {
  try {
    return NextResponse.json(await facets());
  } catch (error) {
    return errorResponse(error);
  }
}
