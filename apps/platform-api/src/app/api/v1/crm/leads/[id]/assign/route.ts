import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { assignLeadSchema } from '@abies/domain/modules/crm/leads.schemas';
import { assignLead } from '@abies/domain/modules/crm/leads.service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = assignLeadSchema.parse(await req.json());
    const lead = await assignLead(id, dto.assignedToId, dto.reason, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
