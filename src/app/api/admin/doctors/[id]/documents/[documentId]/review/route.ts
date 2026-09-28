import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { documentReviewSchema } from '@/modules/doctors/doctors.schemas';
import { reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id, documentId } = await params;
    const { outcome, note } = documentReviewSchema.parse(await req.json());
    const result = await reviewDocument(id, documentId, { userId: ctx.session.userId, ...ctx }, outcome, note);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
