import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { updateLeadSchema } from '@abies/domain/modules/crm/leads.schemas';
import { canAssignLeads, canWriteLeads } from '@abies/domain/modules/crm/rbac';
import { getLead, updateLead } from '@abies/domain/modules/crm/leads.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const lead = await getLead(id, actor);
    // The viewer's permissions come from the same rules the service enforces.
    const viewer = { role: actor.role, canWrite: canWriteLeads(actor), canAssign: canAssignLeads(actor) };
    return NextResponse.json({ lead, viewer });
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = updateLeadSchema.parse(await req.json());
    return NextResponse.json({ lead: await updateLead(id, dto, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
