import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { facets } from '@/modules/panchakarma/catalogue.service';

export async function GET() {
  try {
    const result = await facets();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
