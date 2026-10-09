import { NextResponse } from 'next/server';
import { resetPasswordSchema } from '@abies/domain/modules/auth/auth.schemas';
import { resetPassword } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@abies/domain/server/session';

// Voluntary forgot-password flow for an account that already has a
// password. requestId/otp come from POST /auth/password/forgot. On
// success, every existing session for the account is revoked and this
// response signs the caller into a fresh one.
export async function POST(req: Request) {
  try {
    const body = resetPasswordSchema.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const { token, session } = await resetPassword(body.requestId, body.otp, body.newPassword, { ip, userAgent });

    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error, req);
  }
}
