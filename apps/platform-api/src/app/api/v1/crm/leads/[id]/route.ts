import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { updateLeadSchema } from '@abies/domain/modules/crm/leads.schemas';
import { getLead, updateLead } from '@abies/domain/modules/crm/leads.service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const lead = await getLead(id, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = updateLeadSchema.parse(await req.json());
    const lead = await updateLead(id, dto, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
