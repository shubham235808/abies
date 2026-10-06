import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { customerSummary } from '@abies/domain/modules/crm/customer360.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    return NextResponse.json(await customerSummary(id, actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}
