import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { detail } from '@/modules/doctors/admin-doctors.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    return applyRotatedCookie(NextResponse.json(await detail(id)), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
