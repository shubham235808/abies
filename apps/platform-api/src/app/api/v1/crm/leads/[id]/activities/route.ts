import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { addActivitySchema } from '@abies/domain/modules/crm/leads.schemas';
import { addActivity } from '@abies/domain/modules/crm/leads.service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = addActivitySchema.parse(await req.json());
    const activity = await addActivity(id, dto, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ activity }, { status: 201 }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
