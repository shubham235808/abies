import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createDoctorReviewSchema } from '@abies/domain/modules/reviews/reviews.schemas';
import { reviewDoctor } from '@abies/domain/modules/reviews/reviews.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = createDoctorReviewSchema.parse(await req.json());
    const review = await reviewDoctor(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ review }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
