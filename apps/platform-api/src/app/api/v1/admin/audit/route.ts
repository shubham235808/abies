import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@abies/domain/lib/errors';
import { listAuditEvents } from '@abies/domain/modules/audit/audit.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

const querySchema = z.object({
  eventType: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
});

export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const url = new URL(req.url);
    const { page, ...filters } = querySchema.parse(Object.fromEntries(url.searchParams));
    const result = await listAuditEvents(filters, page ?? 1);
    return applyRotatedCookie(NextResponse.json(result), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
