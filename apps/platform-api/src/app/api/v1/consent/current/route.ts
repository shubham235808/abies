import { NextResponse } from 'next/server';
import { listActiveArtifacts } from '@abies/domain/modules/consent/consent.service';
import { errorResponse } from '@abies/domain/lib/errors';

// Public — a patient must see what they're agreeing to before they've
// logged in.
export async function GET(req: Request) {
  try {
    const artifacts = await listActiveArtifacts();
    return NextResponse.json({ artifacts });
  } catch (error) {
    return errorResponse(error, req);
  }
}
