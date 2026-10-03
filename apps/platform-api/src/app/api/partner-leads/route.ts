import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@abies/domain/lib/errors';
import { createLeadSchema, partnerLeadStageSchema } from '@abies/domain/modules/partners/leads.schemas';
import { createLead, listLeads } from '@abies/domain/modules/partners/leads.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

const querySchema = z.object({ stage: partnerLeadStageSchema.optional() });

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const url = new URL(req.url);
    const { stage } = querySchema.parse(Object.fromEntries(url.searchParams));
    const leads = await listLeads(stage);
    return applyRotatedCookie(NextResponse.json({ leads }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const dto = createLeadSchema.parse(await req.json());
    const lead = await createLead(ctx.session.userId, ctx.session.user.role as 'SALES' | 'ADMIN', dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ lead }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
