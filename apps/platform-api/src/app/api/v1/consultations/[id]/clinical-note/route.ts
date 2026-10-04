import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { saveClinicalNoteSchema } from '@abies/domain/modules/consultations/consultations.schemas';
import { saveClinicalNote } from '@abies/domain/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = saveClinicalNoteSchema.parse(await req.json());
    const note = await saveClinicalNote(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ note }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
