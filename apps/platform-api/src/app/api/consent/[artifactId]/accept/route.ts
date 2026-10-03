import { NextResponse } from 'next/server';
import { acceptConsent } from '@abies/domain/modules/consent/consent.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { artifactId } = await params;
    const record = await acceptConsent(ctx.session.userId, artifactId, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return applyRotatedCookie(NextResponse.json({ record }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
