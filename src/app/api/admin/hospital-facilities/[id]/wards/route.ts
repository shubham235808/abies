import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createWardSchema } from '@/modules/hospital/hospital.schemas';
import { createWard } from '@/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const { id } = await params;
    const dto = createWardSchema.parse(await req.json());
    const ward = await createWard(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ward }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
