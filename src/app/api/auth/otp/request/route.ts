import { NextResponse } from 'next/server';
import { requestOtpSchema } from '@/modules/auth/auth.schemas';
import { requestOtp } from '@/modules/auth/auth.service';
import { errorResponse } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = requestOtpSchema.parse(await req.json());
    const result = await requestOtp(body.mobile, body.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
