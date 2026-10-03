import { NextResponse } from 'next/server';
import { requestOtpSchema } from '@abies/domain/modules/auth/auth.schemas';
import { requestOtp } from '@abies/domain/modules/auth/auth.service';
import { errorResponse } from '@abies/domain/lib/errors';

export async function POST(req: Request) {
  try {
    const body = requestOtpSchema.parse(await req.json());
    const result = await requestOtp(body.mobile, body.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
