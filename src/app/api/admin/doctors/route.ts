import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { adminDoctorQueueQuerySchema } from '@/modules/doctors/doctors.schemas';
import { queue } from '@/modules/doctors/admin-doctors.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { status } = adminDoctorQueueQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await queue(status);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
