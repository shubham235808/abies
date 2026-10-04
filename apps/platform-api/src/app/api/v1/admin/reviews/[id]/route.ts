import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { moderateReviewSchema } from '@abies/domain/modules/reviews/reviews.schemas';
import { moderate } from '@abies/domain/modules/reviews/reviews.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = moderateReviewSchema.parse(await req.json());
    const review = await moderate(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ review }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
