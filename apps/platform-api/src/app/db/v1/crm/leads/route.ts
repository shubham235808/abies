import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { createLeadSchema, listLeadsSchema } from '@abies/domain/modules/crm/leads.schemas';
import { createLead, listLeads } from '@abies/domain/modules/crm/leads.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

// Database service endpoints (docs/DB-SERVICE-PLAN.md). Only reachable inside
// the cluster; the caller's ServiceAccount and the end user's session are both
// checked here, not in the caller.
export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const query = listLeadsSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return NextResponse.json(await listLeads(query, actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const dto = createLeadSchema.parse(await req.json());
    const lead = await createLead(dto, actor);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
}
