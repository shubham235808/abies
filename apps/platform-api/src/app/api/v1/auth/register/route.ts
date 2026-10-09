import { NextResponse } from 'next/server';
import { registerSchema } from '@abies/domain/modules/auth/auth.schemas';
import { register } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@abies/domain/server/session';

export async function POST(req: Request) {
  try {
    const body = registerSchema.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const result = await register({
      name: body.name,
      mobile: body.mobile,
      email: body.email,
      password: body.password,
      meta: { ip, userAgent },
    });

    const response = NextResponse.json({ user: result.session.user });
    response.cookies.set(SESSION_COOKIE_NAME, result.token, sessionCookieOptions(result.session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error, req);
  }
}
