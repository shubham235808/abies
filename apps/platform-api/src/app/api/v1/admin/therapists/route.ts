import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { queue } from '@abies/domain/modules/panchakarma/admin-therapists.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const result = await queue();
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
