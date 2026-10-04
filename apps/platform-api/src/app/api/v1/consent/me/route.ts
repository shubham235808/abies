import { NextResponse } from 'next/server';
import { listUserConsents } from '@abies/domain/modules/consent/consent.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const records = await listUserConsents(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ records }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
