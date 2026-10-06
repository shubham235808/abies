import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { addActivitySchema } from '@abies/domain/modules/crm/leads.schemas';
import { addActivity } from '@abies/domain/modules/crm/leads.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = addActivitySchema.parse(await req.json());
    return NextResponse.json({ activity: await addActivity(id, dto, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
}
