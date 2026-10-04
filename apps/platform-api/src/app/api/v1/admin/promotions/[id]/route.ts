import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { updatePromotionSchema } from '@abies/domain/modules/promotions/promotions.schemas';
import { getPromotion, removePromotion, updatePromotion } from '@abies/domain/modules/promotions/promotions.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const promotion = await getPromotion(id);
    return applyRotatedCookie(NextResponse.json({ promotion }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'promotion.manage');
    const { id } = await params;

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = updatePromotionSchema.parse(JSON.parse(payload));

    const desktopImageEntry = formData.get('desktopImage');
    const desktopImage =
      desktopImageEntry instanceof File
        ? { originalName: desktopImageEntry.name, mimeType: desktopImageEntry.type, size: desktopImageEntry.size, buffer: Buffer.from(await desktopImageEntry.arrayBuffer()) }
        : null;
    const mobileImageEntry = formData.get('mobileImage');
    const mobileImage =
      mobileImageEntry instanceof File
        ? { originalName: mobileImageEntry.name, mimeType: mobileImageEntry.type, size: mobileImageEntry.size, buffer: Buffer.from(await mobileImageEntry.arrayBuffer()) }
        : null;

    const promotion = await updatePromotion(id, dto, desktopImage, mobileImage, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ promotion }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'promotion.manage');
    const { id } = await params;
    await removePromotion(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
