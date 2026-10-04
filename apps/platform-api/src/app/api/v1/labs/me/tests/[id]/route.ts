import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateTestSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';
import { removeTest, updateTest } from '@abies/domain/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;
    const dto = updateTestSchema.parse(await req.json());
    const test = await updateTest(ctx.session.userId, id, dto);
    return applyRotatedCookie(NextResponse.json({ test }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const { id } = await params;
    await removeTest(ctx.session.userId, id);
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
