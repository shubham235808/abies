import { NextResponse } from 'next/server';
import { withdrawConsent } from '@/modules/consent/consent.service';
import { errorResponse } from '@/lib/errors';
import { applyRotatedCookie, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { artifactId } = await params;
    const record = await withdrawConsent(ctx.session.userId, artifactId);
    return applyRotatedCookie(NextResponse.json({ record }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
