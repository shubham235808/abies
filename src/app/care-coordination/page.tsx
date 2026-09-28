import Link from 'next/link';
import { CarePlanItemStatusBadge, SupportTicketPriorityBadge, SupportTicketStatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { listAtRiskItems } from '@/modules/care-plans/care-plans.service';
import { listQueue } from '@/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { OpenTicketButton } from './open-ticket-button';

export default async function CareCoordinationDashboardPage() {
  const session = await requireSessionOrRedirect();
  const tickets = await listQueue(session.user.role);
  const atRiskItems = await listAtRiskItems();

  // docs/UI-REDESIGN-PLAN.md UX-11: clinical-concern tickets surfaced
  // first, then the rest of the queue, then at-risk care-plan items — all
  // on one dashboard instead of a separate /care-plans page.
  const clinicalConcern = tickets.filter((t) => t.category === 'CLINICAL_CONCERN');
  const otherTickets = tickets.filter((t) => t.category !== 'CLINICAL_CONCERN');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Care coordination</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Clinical-concern tickets and at-risk care plans, in one place.
      </p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Clinical concerns</h2>
        {clinicalConcern.length === 0 ? (
          <EmptyState message="No open clinical-concern tickets." />
        ) : (
          <div className="mt-3 space-y-2">
            {clinicalConcern.map((t) => (
              <Link key={t.id} href={`/care-coordination/tickets/${t.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-magenta-200 bg-brand-magenta-50/60 p-4 shadow-sm transition-colors hover:border-brand-magenta-300">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{t.subject}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">{t.requester ? t.requester.mobile : ''}</p>
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

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Other tickets</h2>
        {otherTickets.length === 0 ? (
          <EmptyState message="No other tickets in the queue." />
        ) : (
          <div className="mt-3 space-y-2">
            {otherTickets.map((t) => (
              <ListRow
                key={t.id}
                href={`/care-coordination/tickets/${t.id}`}
                title={t.subject}
                subtitle={`${t.category.replace(/_/g, ' ')} ${t.requester ? `· ${t.requester.mobile}` : ''}`}
                trailing={
                  <>
                    <SupportTicketPriorityBadge priority={t.priority} />
                    <SupportTicketStatusBadge status={t.status} />
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Care plan follow-ups at risk</h2>
        {atRiskItems.length === 0 ? (
          <EmptyState message="Nothing at risk right now." />
        ) : (
          <div className="mt-3 space-y-3">
            {atRiskItems.map((item) => {
              const patientName =
                [item.carePlan.patientUser.patientProfile?.firstName, item.carePlan.patientUser.patientProfile?.lastName]
                  .filter(Boolean)
                  .join(' ') || item.carePlan.patientUser.mobile;
              const doctorName = [item.carePlan.doctorProfile.firstName, item.carePlan.doctorProfile.lastName].filter(Boolean).join(' ');
              return (
                <Card key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-brand-neutral-900">{item.title}</p>
                      <p className="mt-1 text-sm text-brand-neutral-600">
                        {patientName} · Dr. {doctorName}
                      </p>
                      <p className="mt-1 text-xs text-brand-neutral-400">
                        Due {item.dueDate ? new Date(item.dueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'unspecified'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <CarePlanItemStatusBadge status={item.status} />
                      <OpenTicketButton patientMobile={item.carePlan.patientUser.mobile} patientName={patientName} itemTitle={item.title} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
