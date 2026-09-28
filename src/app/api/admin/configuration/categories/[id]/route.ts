import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateConfigCategorySchema } from '@/modules/configuration/configuration.schemas';
import { removeConfigCategory, updateConfigCategory } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = updateConfigCategorySchema.parse(await req.json());
    const category = await updateConfigCategory(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ category }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    await removeConfigCategory(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
