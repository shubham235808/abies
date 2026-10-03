import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { finalizeClinicalNote } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const note = await finalizeClinicalNote(ctx.session.userId, id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ note }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
