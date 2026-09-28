import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createTestSchema } from '@/modules/diagnostics/catalogue.schemas';
import { createTest, listMyTests } from '@/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requirePermission, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const tests = await listMyTests(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ tests }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    requirePermission(ctx, 'diagnostics.catalogue.manage');
    const dto = createTestSchema.parse(await req.json());
    const test = await createTest(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ test }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
