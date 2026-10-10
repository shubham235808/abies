import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  updateAdminProduct,
  updateAdminProductSchema,
} from '@abies/domain/modules/medicines/admin-products.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

// multipart/form-data: a JSON `payload` field for the product's text/boolean
// fields plus an optional `image` file — mirrors admin/promotions/[id]'s PATCH,
// which needs the same "edit fields, optionally replace a file" shape.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;

    const form = await req.formData();
    const payload = form.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = updateAdminProductSchema.parse(JSON.parse(payload));

    const file = form.get('image');
    let image: { body: Uint8Array; contentType: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw new BadRequestError('Product image must be 2 MB or smaller');
      image = { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
    }

    const product = await updateAdminProduct(id, dto, image, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ product }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
