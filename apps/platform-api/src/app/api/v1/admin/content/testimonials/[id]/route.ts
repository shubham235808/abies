import { NextResponse } from 'next/server';
import { BadRequestError, errorResponse } from '@abies/domain/lib/errors';
import { updateTestimonialSchema } from '@abies/domain/modules/content/testimonials.schemas';
import { getTestimonial, removeTestimonial, updateTestimonial } from '@abies/domain/modules/content/testimonials.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const { id } = await params;
    const testimonial = await getTestimonial(id);
    return applyRotatedCookie(NextResponse.json({ testimonial }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;

    const formData = await req.formData();
    const payload = formData.get('payload');
    if (typeof payload !== 'string') throw new BadRequestError('Missing payload');
    const dto = updateTestimonialSchema.parse(JSON.parse(payload));

    const photoEntry = formData.get('photo');
    const photo = photoEntry instanceof File
      ? { originalName: photoEntry.name, mimeType: photoEntry.type, size: photoEntry.size, buffer: Buffer.from(await photoEntry.arrayBuffer()) }
      : null;

    const testimonial = await updateTestimonial(id, dto, photo, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ testimonial }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    await removeTestimonial(id, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
