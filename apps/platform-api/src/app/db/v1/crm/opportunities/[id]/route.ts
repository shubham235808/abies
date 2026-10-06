import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { updateOpportunitySchema } from '@abies/domain/modules/crm/sales.schemas';
import { getOpportunity, updateOpportunity } from '@abies/domain/modules/crm/sales.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    return NextResponse.json({ opportunity: await getOpportunity(id, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = updateOpportunitySchema.parse(await req.json());
    return NextResponse.json({ opportunity: await updateOpportunity(id, dto, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
