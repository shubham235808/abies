import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow } from '@/components/ui/list-row';
import { getMyCentre } from '@/modules/panchakarma/centres.service';
import { listMyTherapies } from '@/modules/panchakarma/catalogue.service';
import { listMineAsCentre } from '@/modules/panchakarma/bookings.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function patientName(booking: { patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null } }) {
  return [booking.patientUser.patientProfile?.firstName, booking.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || booking.patientUser.mobile;
}

export default async function PanchakarmaCentreOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { centre } = await getMyCentre(session.userId);
  const therapies = await listMyTherapies(session.userId);
  const editable = centre.verificationStatus === 'DRAFT' || centre.verificationStatus === 'REJECTED';
  const approved = centre.verificationStatus === 'APPROVED';

  const bookings = approved ? await listMineAsCentre(session.userId) : [];
  const now = new Date();

  // docs/PORTAL-UX-SPEC.md's Panchakarma Centre dashboard — every bucket
  // derived from existing session/booking fields, no new query.
  const todaysSessions = bookings.flatMap((b) =>
    b.sessions.filter((s) => !s.attendedAt && isSameDay(new Date(s.scheduledAt), now)).map((s) => ({ booking: b, session: s })),
  );
  const upcomingSessions = bookings.flatMap((b) =>
    b.sessions.filter((s) => !s.attendedAt && new Date(s.scheduledAt) > now && !isSameDay(new Date(s.scheduledAt), now)).map((s) => ({ booking: b, session: s })),
  );
  const awaitingScheduling = bookings.filter(
    (b) => (b.status === 'BOOKED' || b.status === 'SCHEDULED' || b.status === 'IN_PROGRESS') && b.sessions.length < b.sessionCount,
  );
  const activeCourses = bookings.filter((b) => b.status === 'SCHEDULED' || b.status === 'IN_PROGRESS');
  const completed = bookings.filter((b) => b.status === 'COMPLETED');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">{centre.name || 'Your centre application'}</h1>
        <VerificationBadge status={centre.verificationStatus} />
      </div>

      {centre.verificationStatus === 'REJECTED' && centre.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {centre.rejectionReason}. Update your details below and resubmit.
        </p>
      )}
      {(centre.verificationStatus === 'SUBMITTED' || centre.verificationStatus === 'UNDER_REVIEW') && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s reviewed.
        </p>
      )}
      {centre.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{centre.rejectionReason ? `: ${centre.rejectionReason}` : '.'} Contact ABIES support.
        </p>
      )}

      {editable && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Centre name, address, license numbers.</CardDescription>
            <Link href="/panchakarma-centre/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              Edit →
            </Link>
          </Card>
          <Card>
            <CardTitle className="text-base">Therapies ({therapies.length})</CardTitle>
            <CardDescription>Therapies you offer, with pricing and duration.</CardDescription>
            <Link href="/panchakarma-centre/therapies" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
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
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard title="Today's sessions" value={todaysSessions.length} href="/panchakarma-centre/bookings" />
            <MetricCard title="Upcoming sessions" value={upcomingSessions.length} href="/panchakarma-centre/bookings" />
            <MetricCard title="Awaiting scheduling" value={awaitingScheduling.length} href="/panchakarma-centre/bookings" />
            <MetricCard title="Active courses" value={activeCourses.length} href="/panchakarma-centre/bookings" />
            <MetricCard title="Completed" value={completed.length} href="/panchakarma-centre/bookings" />
            <MetricCard title="Therapists" href="/panchakarma-centre/therapists" description="Manage your practitioner roster" />
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Today&apos;s sessions</h2>
            {todaysSessions.length === 0 ? (
              <EmptyState message="No sessions scheduled for today." />
            ) : (
              <div className="mt-3 space-y-2">
                {todaysSessions.map(({ booking, session: s }) => (
                  <ListRow
                    key={s.id}
                    href={`/panchakarma-centre/bookings/${booking.id}`}
                    title={patientName(booking)}
                    subtitle={`${booking.therapy.name} — Session ${s.sessionNumber}`}
                    meta={new Date(s.scheduledAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Bookings awaiting scheduling</h2>
            {awaitingScheduling.length === 0 ? (
              <EmptyState message="Every active booking has its next session scheduled." />
            ) : (
              <div className="mt-3 space-y-2">
                {awaitingScheduling.map((b) => (
                  <ListRow
                    key={b.id}
                    href={`/panchakarma-centre/bookings/${b.id}`}
                    title={patientName(b)}
                    subtitle={b.therapy.name}
                    meta={`${b.sessions.length}/${b.sessionCount} sessions scheduled`}
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
