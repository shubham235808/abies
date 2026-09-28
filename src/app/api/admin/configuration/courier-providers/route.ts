import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { courierProviderSchema } from '@/modules/configuration/configuration.schemas';
import { createCourierProvider, listCourierProviders } from '@/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const providers = await listCourierProviders();
    return applyRotatedCookie(NextResponse.json({ providers }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const dto = courierProviderSchema.parse(await req.json());
    const provider = await createCourierProvider(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ provider }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
