import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';
import { createFamilyMemberSchema } from '@/modules/patients/patients.schemas';
import { addFamilyMember, listFamilyMembers } from '@/modules/patients/patients.service';
import { applyRotatedCookie, requireRole, requireSession } from '@/server/rbac';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const members = await listFamilyMembers(ctx.session.userId);
    return applyRotatedCookie(NextResponse.json({ members }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'PATIENT');
    const dto = createFamilyMemberSchema.parse(await req.json());
    const member = await addFamilyMember(ctx.session.userId, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ member }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
