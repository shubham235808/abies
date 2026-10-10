import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { createTestimonialSchema } from '@abies/domain/modules/content/testimonials.schemas';
import { createTestimonial, listTestimonials } from '@abies/domain/modules/content/testimonials.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const testimonials = await listTestimonials();
    return applyRotatedCookie(NextResponse.json({ testimonials }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = createTestimonialSchema.parse(JSON.parse(payload));

    const photoEntry = formData.get('photo');
    const photo = photoEntry instanceof File
      ? { originalName: photoEntry.name, mimeType: photoEntry.type, size: photoEntry.size, buffer: Buffer.from(await photoEntry.arrayBuffer()) }
      : null;

    const testimonial = await createTestimonial(dto, photo, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ testimonial }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
