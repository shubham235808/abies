import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { createStaffAccountSchema } from '@abies/domain/modules/staff/staff.schemas';
import { createStaffAccount, listStaff } from '@abies/domain/modules/staff/staff.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const staff = await listStaff();
    return applyRotatedCookie(NextResponse.json({ staff }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const dto = createStaffAccountSchema.parse(await req.json());
    const user = await createStaffAccount(dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ user }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
