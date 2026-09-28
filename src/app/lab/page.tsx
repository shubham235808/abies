import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow } from '@/components/ui/list-row';
import { getMyLab } from '@/modules/diagnostics/labs.service';
import { listMyTests } from '@/modules/diagnostics/catalogue.service';
import { listMineAsLab } from '@/modules/diagnostics/orders.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function patientName(order: { patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null } }) {
  return [order.patientUser.patientProfile?.firstName, order.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || order.patientUser.mobile;
}

export default async function LabOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { lab } = await getMyLab(session.userId);
  const tests = await listMyTests(session.userId);
  const editable = lab.verificationStatus === 'DRAFT' || lab.verificationStatus === 'REJECTED';
  const approved = lab.verificationStatus === 'APPROVED';

  const orders = approved ? await listMineAsLab(session.userId) : [];
  const today = new Date();

  // docs/PORTAL-UX-SPEC.md's Lab dashboard — every bucket derived from
  // DiagnosticOrderStatus, no new query beyond listMineAsLab.
  const todaysCollections = orders.filter((o) => o.status === 'SCHEDULED' && o.scheduledAt && isSameDay(new Date(o.scheduledAt), today));
  const pendingSamples = orders.filter((o) => (o.status === 'BOOKED' || o.status === 'SCHEDULED') && o.scheduledAt && new Date(o.scheduledAt) < today);
  const processing = orders.filter((o) => o.status === 'PROCESSING');
  const reportsPending = orders.filter((o) => o.status === 'PROCESSING' && !o.report);
  const critical = orders.filter((o) => o.report?.criticalFlag && !o.report.doctorAcknowledgedAt);
  const completedToday = orders.filter((o) => o.status === 'COMPLETED' && isSameDay(new Date(o.updatedAt), today));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{lab.name || 'Your lab application'}</h1>
        <VerificationBadge status={lab.verificationStatus} />
      </div>

      {lab.verificationStatus === 'REJECTED' && lab.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {lab.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(lab.verificationStatus === 'SUBMITTED' || lab.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {lab.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{lab.rejectionReason ? `: ${lab.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      {editable && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Lab name, license numbers, service cities.</CardDescription>
            <Link href="/lab/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              Edit →
            </Link>
          </Card>
          <Card>
            <CardTitle className="text-base">Test catalogue ({tests.length})</CardTitle>
            <CardDescription>Tests you offer, with pricing and turnaround.</CardDescription>
            <Link href="/lab/tests" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              Manage →
            </Link>
          </Card>
        </div>
      )}

      {editable && (
        <div className="mt-8">
          <SubmitButton />
        </div>
      )}

      {approved && (
        <>
          {critical.length > 0 && (
            <Card className="mt-6 border-brand-magenta-300 bg-brand-magenta-50/60">
              <CardTitle className="text-base text-brand-magenta-800">
                {critical.length} critical result{critical.length !== 1 ? 's' : ''} awaiting doctor acknowledgement
              </CardTitle>
              <div className="mt-2 space-y-2">
                {critical.map((o) => (
                  <ListRow
                    key={o.id}
                    href={`/lab/orders/${o.id}`}
                    title={patientName(o)}
                    subtitle={o.items.map((i) => i.test?.name ?? i.package?.name).filter(Boolean).join(', ')}
                  />
                ))}
              </div>
            </Card>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard title="Today's collections" value={todaysCollections.length} href="/lab/orders" />
            <MetricCard title="Pending samples" value={pendingSamples.length} href="/lab/orders" />
            <MetricCard title="Processing" value={processing.length} href="/lab/orders" />
            <MetricCard title="Reports pending" value={reportsPending.length} href="/lab/orders" />
            <MetricCard title="Completed today" value={completedToday.length} href="/lab/orders" />
            <MetricCard title="Test catalogue" value={tests.length} href="/lab/tests" />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Today&apos;s collections</h2>
            {todaysCollections.length === 0 ? (
              <EmptyState message="No collections today." />
            ) : (
              <div className="mt-3 space-y-2">
                {todaysCollections.map((o) => (
                  <ListRow
                    key={o.id}
                    href={`/lab/orders/${o.id}`}
                    title={patientName(o)}
                    subtitle={o.items.map((i) => i.test?.name ?? i.package?.name).filter(Boolean).join(', ')}
                    meta={o.collectionMode === 'HOME' ? 'Home collection' : 'Lab visit'}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
