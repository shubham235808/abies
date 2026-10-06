import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { createOpportunitySchema, listOpportunitiesSchema } from '@abies/domain/modules/crm/sales.schemas';
import { createOpportunity, listOpportunities } from '@abies/domain/modules/crm/sales.service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const query = listOpportunitiesSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return NextResponse.json(await listOpportunities(query, actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const dto = createOpportunitySchema.parse(await req.json());
    return NextResponse.json({ opportunity: await createOpportunity(dto, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
}
