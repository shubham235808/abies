import { NextResponse } from 'next/server';
import { logout } from '@/modules/auth/auth.service';
import { errorResponse } from '@/lib/errors';
import { requireSession } from '@/server/rbac';
import { SESSION_COOKIE_NAME } from '@/server/session';

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    await logout(ctx.session);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
