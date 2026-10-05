import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { listAssignees } from '@abies/domain/modules/crm/leads.service';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const users = await listAssignees(crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ users }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
