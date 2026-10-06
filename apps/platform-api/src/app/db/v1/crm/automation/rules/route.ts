import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { createRuleSchema, setRuleEnabledSchema } from '@abies/domain/modules/crm/automation.schemas';
import { createRule, listRules, runIdleCheck, setRuleEnabled } from '@abies/domain/modules/crm/automation.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    return NextResponse.json({ rules: await listRules(actor) });
  } catch (error) {
    return errorResponse(error, req);
  }
}

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const dto = createRuleSchema.parse(await req.json());
    return NextResponse.json({ rule: await createRule(dto, actor) }, { status: 201 });
  } catch (error) {
    return errorResponse(error, req);
  }
}
