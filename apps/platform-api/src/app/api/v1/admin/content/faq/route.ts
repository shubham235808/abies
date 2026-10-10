import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createFaqEntrySchema } from '@abies/domain/modules/content/faq.schemas';
import { createFaqEntry, listFaqEntries } from '@abies/domain/modules/content/faq.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const entries = await listFaqEntries();
    return applyRotatedCookie(NextResponse.json({ entries }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = createFaqEntrySchema.parse(await req.json());
    const entry = await createFaqEntry(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ entry }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
