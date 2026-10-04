import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { facets } from '@abies/domain/modules/panchakarma/catalogue.service';

export async function GET(req: Request) {
  try {
    const result = await facets();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
}
