import { prisma } from '../lib/db';

// Shared audit logger called explicitly from server actions/route handlers
// that perform a sensitive action. This is the Next.js equivalent of the
// NestJS AuditInterceptor referenced in docs/DECISIONS.md (D6) — there's no
// framework-level interceptor hook here, so callers opt in explicitly
// rather than relying on it firing automatically for every request.
//
// Never pass PHI (clinical notes, document contents, etc.) in `metadata` —
// only identifiers and non-sensitive context, per docs/TARGET-ARCHITECTURE.md.
export interface AuditContext {
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditEntry {
  eventType: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(ctx: AuditContext, entry: AuditEntry): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      eventType: entry.eventType,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata as never,
    },
  });
}
