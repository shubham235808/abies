import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createTherapySchema } from '@/modules/panchakarma/catalogue.schemas';
import { createTherapy, listMyTherapies } from '@/modules/panchakarma/catalogue.service';
import { applyRotatedCookie, requirePermission, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    const therapies = await listMyTherapies(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ therapies }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PANCHAKARMA_CENTRE');
    requirePermission(ctx, 'panchakarma.catalogue.manage');
    const dto = createTherapySchema.parse(await req.json());
    const therapy = await createTherapy(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ therapy }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
