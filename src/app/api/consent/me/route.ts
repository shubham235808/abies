import { NextResponse } from 'next/server';
import { listUserConsents } from '@/modules/consent/consent.service';
import { errorResponse } from '@/lib/errors';
import { applyRotatedCookie, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const records = await listUserConsents(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ records }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
