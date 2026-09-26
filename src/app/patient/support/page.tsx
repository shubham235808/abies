import Link from 'next/link';
import { SupportTicketPriorityBadge, SupportTicketStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listMineAsRequester } from '@/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function PatientSupportPage() {
  const session = await requireSessionOrRedirect();
  const tickets = await listMineAsRequester(session.userId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">Support</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
            Open a ticket about a booking, payment, report, medicine or therapy order — or a clinical safety concern.
          </p>
        </div>
        <Link href="/patient/support/new">
          <Button>New ticket</Button>
        </Link>
      </div>

      {tickets.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">You haven&apos;t opened any tickets yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {tickets.map((t) => (
            <Link key={t.id} href={`/patient/support/${t.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
                <div>
                  <p className="font-medium text-brand-neutral-900">{t.subject}</p>
                  <p className="mt-1 text-sm text-brand-neutral-600">{t.category.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-brand-neutral-400">
                    {new Date(t.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
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
      )}
    </div>
  );
}
