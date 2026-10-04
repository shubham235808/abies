import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createTherapistSchema } from '@abies/domain/modules/panchakarma/catalogue.schemas';
import { createTherapist, listMyTherapists } from '@abies/domain/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const therapists = await listMyTherapists(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ therapists }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const dto = createTherapistSchema.parse(await req.json());
    const therapist = await createTherapist(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ therapist }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
