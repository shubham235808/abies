import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { documentRequirementSchema } from '@/modules/configuration/configuration.schemas';
import { createDocumentRequirement, listDocumentRequirements } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requirePermission, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const partnerType = new URL(req.url).searchParams.get('partnerType') ?? undefined;
    const requirements = await listDocumentRequirements(partnerType);
    return applyRotatedCookie(NextResponse.json({ requirements }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    requirePermission(ctx, 'configuration.manage');
    const dto = documentRequirementSchema.parse(await req.json());
    const requirement = await createDocumentRequirement(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ requirement }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
