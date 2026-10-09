import { NextResponse } from 'next/server';
import { errorResponse } from '@abies/domain/lib/errors';
import { listNotificationTemplates } from '@abies/domain/modules/configuration/configuration.service';
import { applyRotatedCookie, requireAdminMfa, requireSession } from '@abies/domain/server/rbac';

// Read-only (ENTERPRISE-15). POST used to create a row in a Postgres
// NotificationTemplate table that no send path ever read — editing it
// through the old admin form changed nothing about what actually sent.
// GET now returns the real, code-registered template catalogue instead of
// those dead rows. See configuration.service.ts's listNotificationTemplates()
// for the full reasoning.
export async function GET(req: Request) {
  try {
    const ctx = await requireSession(req);
    requireAdminMfa(ctx);
    const templates = listNotificationTemplates();
    return applyRotatedCookie(NextResponse.json({ templates }), ctx);
  } catch (error) {
    return errorResponse(error, req);
  }
}
