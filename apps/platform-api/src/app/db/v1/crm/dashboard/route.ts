import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { dashboard } from '@abies/domain/modules/crm/sales.service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    return NextResponse.json(await dashboard(actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}
