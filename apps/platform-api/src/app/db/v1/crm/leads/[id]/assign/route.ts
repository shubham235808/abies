import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { assignLeadSchema } from '@abies/domain/modules/crm/leads.schemas';
import { assignLead } from '@abies/domain/modules/crm/leads.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = assignLeadSchema.parse(await req.json());
    return NextResponse.json({ lead: await assignLead(id, dto.assignedToId, dto.reason, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
