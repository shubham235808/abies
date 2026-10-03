import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { approve } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const result = await approve(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
