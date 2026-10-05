import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { applyRotatedCookie, requireSession } from '@abies/domain/server/rbac';
import { crmActorFromContext } from '@abies/domain/modules/crm/actor';
import { changeStageSchema } from '@abies/domain/modules/crm/leads.schemas';
import { changeStage } from '@abies/domain/modules/crm/leads.service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession(req);
    const { id } = await params;
    const dto = changeStageSchema.parse(await req.json());
    const lead = await changeStage(id, dto.stage, dto.reason, crmActorFromContext(ctx));
    return applyRotatedCookie(NextResponse.json({ lead }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
