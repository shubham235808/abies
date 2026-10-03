import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { detail } from '@abies/domain/modules/medicines/admin-pharmacies.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const result = await detail(id);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
