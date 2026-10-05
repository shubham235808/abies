import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { createLeadSchema, listLeadsSchema } from '@abies/domain/modules/crm/leads.schemas';
import { createLead, listLeads } from '@abies/domain/modules/crm/leads.service';

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    const url = new URL(req.url);
    const query = listLeadsSchema.parse(Object.fromEntries(url.searchParams));
    const result = await listLeads(query, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    const dto = createLeadSchema.parse(await req.json());
    const lead = await createLead(dto, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ lead }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
