import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { createRuleSchema, setRuleEnabledSchema } from '@abies/domain/modules/crm/automation.schemas';
import { createRule, listRules, runIdleCheck, setRuleEnabled } from '@abies/domain/modules/crm/automation.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    return NextResponse.json(await runIdleCheck(actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}
