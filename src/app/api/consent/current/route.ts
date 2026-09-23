import { NextResponse } from 'next/server';
import { listActiveArtifacts } from '@/modules/consent/consent.service';
import { errorResponse } from '@/lib/errors';

// Public — a patient must see what they're agreeing to before they've
// logged in.
export async function GET() {
  try {
    const artifacts = await listActiveArtifacts();
    return NextResponse.json({ artifacts });
  } catch (error) {
    return errorResponse(error);
  }
}
