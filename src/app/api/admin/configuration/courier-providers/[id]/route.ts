import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { updateCourierProviderSchema } from '@/modules/configuration/configuration.schemas';
import { removeCourierProvider, updateCourierProvider } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const dto = updateCourierProviderSchema.parse(await req.json());
    const provider = await updateCourierProvider(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ provider }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    await removeCourierProvider(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
