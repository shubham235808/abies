import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/errors';
import { acknowledgeCarePlanItem } from '@/modules/care-plans/care-plans.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

const bodySchema = z.object({ done: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const { id } = await params;
    const dto = bodySchema.parse(await req.json());
    const item = await acknowledgeCarePlanItem(ctx.session.userId, id, dto.done);
    return applyRotatedCookie(NextResponse.json({ item }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
