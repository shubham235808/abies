import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { facets } from '@abies/domain/modules/doctors/doctors.service';

export async function GET(req: Request) {
  try {
    return NextResponse.json(await facets());
  } catch (error) {
    return errorResponse(error, req);
  }
}
