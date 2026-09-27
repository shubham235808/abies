import { prisma } from '@/lib/db';

export interface AuditQueryFilters {
  eventType?: string;
  resourceType?: string;
  userId?: string;
  from?: string;
  to?: string;
}

const PAGE_SIZE = 50;

// Read-side of the audit log — src/server/audit.ts (recordAuditEvent) is the
// only writer, kept deliberately untouched. This is the first UI/API ever
// built against AuditEvent: every phase since Phase 1 has written rows here,
// none has ever displayed them (docs/SECURITY-MODEL.md's "audit log access"
// privileged action existed only as a design intent until this phase).
export async function listAuditEvents(filters: AuditQueryFilters, page = 1) {
  const where = {
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
    ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
  };

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      include: { user: { select: { mobile: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, total, page, pageSize: PAGE_SIZE, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// Populates the eventType filter dropdown from what's actually in the table
// — a hardcoded list would drift the moment a new module adds its own
// eventType string (every phase so far has invented its own: AUTH,
// DOCTOR_PROFILE, PANCHAKARMA_BOOKING, SUPPORT_TICKET, REFUND, ...).
export async function listDistinctEventTypes() {
  const rows = await prisma.auditEvent.findMany({ distinct: ['eventType'], select: { eventType: true }, orderBy: { eventType: 'asc' } });
  return rows.map((r) => r.eventType);
}
