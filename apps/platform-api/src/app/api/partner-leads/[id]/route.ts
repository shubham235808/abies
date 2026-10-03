import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { updateLeadSchema } from '@abies/domain/modules/partners/leads.schemas';
import { getLead, updateLead } from '@abies/domain/modules/partners/leads.service';
import { applyRotatedCookie, requireRole, requireSession } from '@abies/domain/server/rbac';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const { id } = await params;
    const lead = await getLead(id);
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    requireRole(ctx, 'SALES', 'ADMIN');
    const { id } = await params;
    const dto = updateLeadSchema.parse(await req.json());
    const lead = await updateLead(id, dto, { userId: ctx.session.userId, ...ctx });
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error);
  }
}
