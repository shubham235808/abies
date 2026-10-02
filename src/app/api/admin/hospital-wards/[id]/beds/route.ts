import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createBedSchema } from '@/modules/hospital/hospital.schemas';
import { createBed } from '@/modules/hospital/facilities.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'hospital.manage');
    const { id } = await params;
    const dto = createBedSchema.parse(await req.json());
    const bed = await createBed(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ bed }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
