import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createPackageSchema } from '@/modules/diagnostics/catalogue.schemas';
import { createPackage, listMyPackages } from '@/modules/diagnostics/catalogue.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const packages = await listMyPackages(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ packages }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'LAB');
    const dto = createPackageSchema.parse(await req.json());
    const diagnosticPackage = await createPackage(ctx.session.userId, dto);
    return applyRotatedCookie(NextResponse.json({ package: diagnosticPackage }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
