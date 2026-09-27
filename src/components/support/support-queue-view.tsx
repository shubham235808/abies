import { Tabs, type TabItem } from '@/components/ui/tabs';
import { TicketQueueList } from './ticket-queue-list';
import { listQueue } from '@/modules/support/tickets.service';
import type { UserRole } from '@prisma/client';

const TAB_DEFS = [
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'My tickets' },
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
  { key: 'awaiting-customer', label: 'Awaiting customer' },
  { key: 'resolved-today', label: 'Resolved today' },
] as const;
type TabKey = (typeof TAB_DEFS)[number]['key'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// docs/PORTAL-UX-SPEC.md's Support queue segmentation — every bucket
// derived from SupportTicket's existing assignedAgentUserId/priority/
// status/resolvedAt fields, shared by both Customer Support and Technical
// Support (the two portals differ only in title/basePath, not in schema
// fields available — Technical Support's requested request-ID/browser-
// context fields don't exist and are intentionally not fabricated here).
function matchesTab(
  t: { assignedAgentUserId: string | null; priority: string; status: string; resolvedAt: Date | null },
  tab: TabKey,
  userId: string,
  now: Date,
) {
  switch (tab) {
    case 'unassigned':
      return !t.assignedAgentUserId;
    case 'mine':
      return t.assignedAgentUserId === userId;
    case 'p1':
      return t.priority === 'P1';
    case 'p2':
      return t.priority === 'P2';
    case 'awaiting-customer':
      return t.status === 'WAITING_CUSTOMER';
    case 'resolved-today':
      return t.status === 'RESOLVED' && !!t.resolvedAt && isSameDay(new Date(t.resolvedAt), now);
  }
}

export async function SupportQueueView({
  role,
  userId,
  basePath,
  queuePath,
  title,
  description,
  tab,
}: {
  role: UserRole;
  userId: string;
  basePath: string;
  queuePath: string;
  title: string;
  description: string;
  tab?: string;
}) {
  const tickets = await listQueue(role);
  const now = new Date();
  const activeTab: TabKey = TAB_DEFS.find((t) => t.key === tab)?.key ?? 'unassigned';

  const tabItems: TabItem[] = TAB_DEFS.map((t) => ({
    label: t.label,
    href: t.key === 'unassigned' ? queuePath : `${queuePath}?tab=${t.key}`,
    active: activeTab === t.key,
    count: tickets.filter((ticket) => matchesTab(ticket, t.key, userId, now)).length,
  }));

  const visible = tickets.filter((t) => matchesTab(t, activeTab, userId, now));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">{description}</p>
      <div className="mt-4">
        <Tabs items={tabItems} />
      </div>
      <TicketQueueList tickets={JSON.parse(JSON.stringify(visible))} basePath={basePath} />
    </div>
  );
}
