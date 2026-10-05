import { NextResponse } from 'next/server';
import { errorResponse, BadRequestError } from '@abies/domain/lib/errors';
import {
  adminProductSchema,
  createAdminProduct,
  listAdminProducts,
  MAX_PRODUCT_IMAGE_BYTES,
} from '@abies/domain/modules/medicines/admin-products.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const products = await listAdminProducts();
    return applyRotatedCookie(NextResponse.json({ products }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

// multipart/form-data: text fields for the product and an optional `image` file.
export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);

    const form = await req.formData();
    const dto = adminProductSchema.parse({
      name: form.get('name'),
      genericName: form.get('genericName') || undefined,
      brandName: form.get('brandName') || undefined,
      category: form.get('category') || undefined,
      mrp: form.get('mrp') || undefined,
      requiresPrescription: form.get('requiresPrescription') === 'true',
    });

    const file = form.get('image');
    let image: { body: Uint8Array; contentType: string } | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw new BadRequestError('Product image must be 2 MB or smaller');
      image = { body: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
    }

    const product = await createAdminProduct(dto, image, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ product }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
