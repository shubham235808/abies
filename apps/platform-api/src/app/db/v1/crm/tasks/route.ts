import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';
import { createTaskSchema, listTasksSchema } from '@abies/domain/modules/crm/sales.schemas';
import { createTask, listTasks } from '@abies/domain/modules/crm/sales.service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const query = listTasksSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    return NextResponse.json(await listTasks(query, actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const dto = createTaskSchema.parse(await req.json());
    return NextResponse.json({ task: await createTask(dto, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
}
