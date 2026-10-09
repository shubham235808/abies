import { NextResponse } from 'next/server';
import { loginSchema } from '@abies/domain/modules/auth/auth.schemas';
import { login } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@abies/domain/server/session';

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const result = await login({ mobile: body.mobile, email: body.email }, body.password, { ip, userAgent });

    if (result.requiresPasswordSetup) {
      // Expected state, not an error — this account has never set a
      // password (legacy OTP-only). The client must drive the caller
      // through POST /auth/password/forgot (to get an OTP) then POST
      // /auth/password/setup, instead of retrying login.
      return NextResponse.json({ requiresPasswordSetup: true, mobile: result.mobile });
    }

    const response = NextResponse.json({
      requiresPasswordSetup: false,
      user: result.session.user,
      mfaRequired: result.mfaRequired,
    });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(result.session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error, req);
  }
}
