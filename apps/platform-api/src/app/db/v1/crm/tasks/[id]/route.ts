import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { updateTaskSchema } from '@abies/domain/modules/crm/sales.schemas';
import { updateTask } from '@abies/domain/modules/crm/sales.service';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const { id } = await params;
    const dto = updateTaskSchema.parse(await req.json());
    return NextResponse.json({ task: await updateTask(id, dto, actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}
