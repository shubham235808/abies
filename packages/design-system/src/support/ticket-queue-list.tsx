import Link from 'next/link';
import { SupportTicketPriorityBadge, SupportTicketStatusBadge } from '@abies/design-system/components/ui/badge';

export interface QueueTicketRow {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  requester?: { mobile: string } | null;
  assignedAgent?: { mobile: string } | null;
}

export function TicketQueueList({ tickets, basePath }: { tickets: QueueTicketRow[]; basePath: string }) {
  if (tickets.length === 0) {
    return <p className="mt-6 text-sm text-brand-neutral-500">No tickets here right now.</p>;
  }
  return (
    <div className="mt-6 space-y-3">
      {tickets.map((t) => (
        <Link key={t.id} href={`${basePath}/${t.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
            <div>
              <p className="font-medium text-brand-neutral-900">{t.subject}</p>
              <p className="mt-1 text-sm text-brand-neutral-600">
                {t.category.replace(/_/g, ' ')} {t.requester ? `· ${t.requester.mobile}` : ''}
              </p>
              <p className="mt-1 text-xs text-brand-neutral-400">
                {new Date(t.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                {t.assignedAgent ? ` · Assigned to ${t.assignedAgent.mobile}` : ' · Unassigned'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <SupportTicketPriorityBadge priority={t.priority} />
              <SupportTicketStatusBadge status={t.status} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
