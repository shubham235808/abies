import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { facets } from '@abies/domain/modules/medicines/catalogue.service';

export async function GET() {
  try {
    const result = await facets();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
