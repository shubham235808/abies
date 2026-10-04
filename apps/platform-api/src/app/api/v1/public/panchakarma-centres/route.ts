import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listApprovedCentres } from '@abies/domain/modules/panchakarma/centres.service';

export async function GET(req: Request) {
  try {
    const city = new URL(req.url).searchParams.get('city') ?? undefined;
    const centres = await listApprovedCentres(city);
    return NextResponse.json({ centres });
  } catch (error) {
    return errorResponse(error, req);
  }
}
