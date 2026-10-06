import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { closeOpportunitySchema } from '@abies/domain/modules/crm/sales.schemas';
import { closeOpportunity } from '@abies/domain/modules/crm/sales.service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = closeOpportunitySchema.parse(await req.json());
    return NextResponse.json({ opportunity: await closeOpportunity(id, dto.outcome, dto.reason, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
