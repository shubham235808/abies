import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@abies/domain/lib/errors';
import { crmActorFromSession } from '@abies/domain/modules/crm/actor';
import { exportLeadsCsv, listCrmAudit, listDuplicateGroups, mergeLeads } from '@abies/domain/modules/crm/enterprise.service';
import { sessionFromRequest, verifyCallerToken } from '@abies/domain/server/db-service';

const mergeSchema = z.object({
  targetId: z.string().min(1),
  sourceId: z.string().min(1),
  reason: z.string().trim().min(3, 'Give a reason for the merge').max(300),
});

export async function POST(req: Request) {
  try {
    await verifyCallerToken(req);
    const actor = crmActorFromSession(await sessionFromRequest(req));
    const dto = mergeSchema.parse(await req.json());
    return NextResponse.json(await mergeLeads(dto.targetId, dto.sourceId, dto.reason, actor));
  } catch (error) {
    return errorResponse(error, req);
  }
}
