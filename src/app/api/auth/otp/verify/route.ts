import { NextResponse } from 'next/server';
import { verifyOtpSchema } from '@/modules/auth/auth.schemas';
import { verifyOtp } from '@/modules/auth/auth.service';
import { errorResponse } from '@/lib/errors';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '@/server/session';

export async function POST(req: Request) {
  try {
    const body = verifyOtpSchema.parse(await req.json());
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const { token, session, mfaRequired } = await verifyOtp(body.requestId, body.otp, body.acceptedTerms, {
      ip,
      userAgent,
    });

    const response = NextResponse.json({ user: session.user, mfaRequired });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
