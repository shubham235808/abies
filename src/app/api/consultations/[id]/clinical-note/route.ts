import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { saveClinicalNoteSchema } from '@/modules/consultations/consultations.schemas';
import { saveClinicalNote } from '@/modules/consultations/consultations.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = saveClinicalNoteSchema.parse(await req.json());
    const note = await saveClinicalNote(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ note }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
