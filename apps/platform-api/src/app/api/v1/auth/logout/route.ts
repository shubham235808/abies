import { NextResponse } from 'next/server';
import { logout } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { requireSession } from '@abies/domain/server/rbac';
import { SESSION_COOKIE_NAME } from '@abies/domain/server/session';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    await logout(ctx.session);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    return errorResponse(error, req);
  }
}
