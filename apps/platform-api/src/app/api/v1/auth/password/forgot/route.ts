import { NextResponse } from 'next/server';
import { requestPasswordResetSchema } from '@abies/domain/modules/auth/auth.schemas';
import { requestPasswordReset } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';

// Covers both the voluntary "forgot password" flow and the forced
// first-time password-setup flow — both start by getting an OTP here. The
// response is always the same generic shape, regardless of whether the
// account exists (auth.service.ts requestPasswordReset).
export async function POST(req: Request) {
  try {
    const body = requestPasswordResetSchema.parse(await req.json());
    const result = await requestPasswordReset({ mobile: body.mobile, email: body.email });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, req);
  }
}
