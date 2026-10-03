import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listApprovedPharmacies } from '@abies/domain/modules/medicines/pharmacies.service';

export async function GET(req: Request) {
  try {
    const area = new URL(req.url).searchParams.get('area') ?? undefined;
    const pharmacies = await listApprovedPharmacies(area);
    return NextResponse.json({ pharmacies });
  } catch (error) {
    return errorResponse(error);
  }
}
