import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { adminCreatePackageSchema } from '@abies/domain/modules/diagnostics/catalogue.schemas';
import { adminCreatePackage, adminListPackages } from '@abies/domain/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const labId = new URL(req.url).searchParams.get('labId') ?? undefined;
    const packages = await adminListPackages(labId);
    return applyRotatedCookie(NextResponse.json({ packages }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const dto = adminCreatePackageSchema.parse(await req.json());
    const diagnosticPackage = await adminCreatePackage(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ package: diagnosticPackage }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
