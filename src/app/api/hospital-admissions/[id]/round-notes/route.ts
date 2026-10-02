import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { addRoundNoteSchema } from '@/modules/hospital/hospital.schemas';
import { addRoundNote } from '@/modules/hospital/admissions.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'DOCTOR');
    const { id } = await params;
    const dto = addRoundNoteSchema.parse(await req.json());
    const note = await addRoundNote(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ note }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
