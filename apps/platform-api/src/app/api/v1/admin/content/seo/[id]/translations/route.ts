import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { translationLanguageSchema } from '@abies/domain/modules/content/languages';
import { upsertPageSeoTranslationSchema } from '@abies/domain/modules/content/seo.schemas';
import { removePageSeoTranslation, upsertPageSeoTranslation } from '@abies/domain/modules/content/seo.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

// Create-or-replace the translation of English row [id] in body.language.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const { id } = await params;
    const dto = upsertPageSeoTranslationSchema.parse(await req.json());
    const translation = await upsertPageSeoTranslation(id, dto, ctx.session.userId, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ translation }), ctx);
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
    const language = translationLanguageSchema.parse(new URL(req.url).searchParams.get('language'));
    await removePageSeoTranslation(id, language, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ ok: true }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
