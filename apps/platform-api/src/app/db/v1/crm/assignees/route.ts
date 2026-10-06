import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { listAssignees } from '@abies/domain/modules/crm/leads.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    return NextResponse.json({ users: await listAssignees(actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
