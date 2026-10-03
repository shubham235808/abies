import { MetricCard } from '@abies/design-system/components/ui/metric-card';
import { SupportQueueView } from '@abies/design-system/support/support-queue-view';
import { supportVolumeBreakdown } from '@abies/domain/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

const CATEGORY_LABELS: Record<string, string> = {
  BOOKING: 'Booking & scheduling',
  PAYMENT: 'Payments & refunds',
  REPORT: 'Diagnostic report',
  MEDICINE: 'Medicine order',
  THERAPY: 'Panchakarma therapy',
  CLINICAL_CONCERN: 'Clinical safety concern',
  TECHNICAL_ISSUE: 'Technical issue',
  GENERAL: 'General enquiry',
};

export default async function CustomerSupportQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSessionOrRedirect();
  const { tab } = await searchParams;
  const breakdown = await supportVolumeBreakdown('CUSTOMER_SUPPORT');

  return (
    <div>
      {/* Priority/SLA-risk framing — what differentiates this portal from
          Tech Support's module/type breakdown, per docs/PORTAL-UX-SPEC.md. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Open tickets" value={breakdown.open} />
        <MetricCard title="SLA breached (open)" value={breakdown.slaBreached} />
        <MetricCard title="Open by priority" rows={breakdown.byPriority.map(([p, count]) => ({ label: p, value: count }))} />
      </div>
      <div className="mt-4">
        <MetricCard
          title="Open by category"
          rows={breakdown.byCategory.map(([key, count]) => ({ label: CATEGORY_LABELS[key] ?? key, value: count }))}
          emptyLabel="No open tickets."
        />
      </div>

      <div className="mt-6">
        <SupportQueueView
          role={session.user.role}
          userId={session.userId}
          basePath="/ops/customer-support/tickets"
          queuePath="/ops/customer-support"
          title="Ticket queue"
          description="Customer support tickets, ordered by priority."
          tab={tab}
        />
      </div>
    </div>
  );
}
