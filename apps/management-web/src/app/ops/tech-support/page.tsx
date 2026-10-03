import { MetricCard } from '@abies/design-system/components/ui/metric-card';
import { SupportQueueView } from '@abies/design-system/support/support-queue-view';
import { technicalIncidentBreakdown } from '@abies/domain/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

const MODULE_LABELS: Record<string, string> = {
  APPOINTMENTS: 'Appointments',
  DIAGNOSTICS: 'Diagnostics',
  MEDICINES: 'Medicines',
  PANCHAKARMA: 'Panchakarma',
  PAYMENTS: 'Payments',
  ACCOUNT: 'Account',
  OTHER: 'Other',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  PAGE_WONT_LOAD: "Page won't load",
  ACTION_FAILED: 'Action failed',
  SLOW_PERFORMANCE: 'Slow performance',
  DATA_LOOKS_WRONG: 'Data looks wrong',
  OTHER: 'Other',
};

export default async function TechSupportQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSessionOrRedirect();
  const { tab } = await searchParams;
  const breakdown = await technicalIncidentBreakdown();

  return (
    <div>
      {/* Module/integration breakdown — what actually differentiates this
          portal from Customer Support's priority/SLA framing, per
          docs/ENTERPRISE-DATA-MODEL-CHANGES.md §8. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="Open incidents by module"
          rows={breakdown.byModule.map(([key, count]) => ({ label: MODULE_LABELS[key] ?? key, value: count }))}
          emptyLabel="No open incidents with a module recorded."
        />
        <MetricCard
          title="Open incidents by type"
          rows={breakdown.byClassification.map(([key, count]) => ({ label: CLASSIFICATION_LABELS[key] ?? key, value: count }))}
          emptyLabel="No open incidents with a type recorded."
        />
      </div>

      <div className="mt-6">
        <SupportQueueView
          role={session.user.role}
          userId={session.userId}
          basePath="/ops/tech-support/tickets"
          queuePath="/ops/tech-support"
          title="Ticket queue"
          description="Technical support / incident tickets, ordered by priority."
          tab={tab}
        />
      </div>
    </div>
  );
}
