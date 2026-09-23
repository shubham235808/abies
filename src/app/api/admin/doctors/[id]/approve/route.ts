import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { verificationActionSchema } from '@/modules/doctors/doctors.schemas';
import { approve } from '@/modules/doctors/admin-doctors.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const { notes } = verificationActionSchema.parse(await req.json().catch(() => ({})));
    const result = await approve(id, { userId: ctx.session.userId, ...ctx }, notes);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
