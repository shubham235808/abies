import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { exportLeadsCsv, listCrmAudit, listDuplicateGroups, mergeLeads } from '@abies/domain/modules/crm/enterprise.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

export async function GET(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await exportLeadsCsv(actor, { stage: params.get('stage') ?? undefined, source: params.get('source') ?? undefined }));
  } catch (error) {
    return errorResponse(error, req);
  }
}
