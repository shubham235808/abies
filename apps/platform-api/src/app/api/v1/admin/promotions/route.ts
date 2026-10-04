import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { createPromotionSchema, promotionPlacementSchema } from '@abies/domain/modules/promotions/promotions.schemas';
import { createPromotion, listPromotions } from '@abies/domain/modules/promotions/promotions.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { searchParams } = new URL(req.url);
    const placementParam = searchParams.get('placement');
    const placement = placementParam ? promotionPlacementSchema.parse(placementParam) : undefined;
    const promotions = await listPromotions(placement);
    return applyRotatedCookie(NextResponse.json({ promotions }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'promotion.manage');

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = createPromotionSchema.parse(JSON.parse(payload));

    const desktopImage = formData.get('desktopImage');
    if (!(desktopImage instanceof File)) throw new BadRequestError('Desktop image is required');
    const mobileImageEntry = formData.get('mobileImage');
    const mobileImage = mobileImageEntry instanceof File ? mobileImageEntry : null;

    const promotion = await createPromotion(
      dto,
      { originalName: desktopImage.name, mimeType: desktopImage.type, size: desktopImage.size, buffer: Buffer.from(await desktopImage.arrayBuffer()) },
      mobileImage
        ? { originalName: mobileImage.name, mimeType: mobileImage.type, size: mobileImage.size, buffer: Buffer.from(await mobileImage.arrayBuffer()) }
        : null,
      ctx.session.userId,
      { userId: ctx.session.userId, ...ctx },
    );
    return applyRotatedCookie(NextResponse.json({ promotion }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
