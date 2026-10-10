import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { adminCreateTestSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';
import { adminCreateTest, adminListTests } from '@abies/domain/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const labId = new URL(req.url).searchParams.get('labId') ?? undefined;
    const tests = await adminListTests(labId);
    return applyRotatedCookie(NextResponse.json({ tests }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const dto = adminCreateTestSchema.parse(await req.json());
    const test = await adminCreateTest(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ test }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
