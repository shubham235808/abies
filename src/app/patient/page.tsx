import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { AppointmentStatusBadge, MedicineOrderStatusBadge, PanchakarmaBookingStatusBadge } from '@/components/ui/badge';
import { listMineAsPatient as listAppointments } from '@/modules/appointments/appointments.service';
import { listMineAsPatient as listCarePlans } from '@/modules/care-plans/care-plans.service';
import { listMineAsPatient as listDiagnosticOrders } from '@/modules/diagnostics/orders.service';
import { listMineAsPatient as listMedicineOrders } from '@/modules/medicines/orders.service';
import { listMineAsPatient as listPanchakarmaBookings } from '@/modules/panchakarma/bookings.service';
import { listMineAsRequester as listSupportTickets } from '@/modules/support/tickets.service';
import { getMyProfile } from '@/modules/patients/patients.service';
import { requireSessionOrRedirect } from '@/server/current-user';

// Replaces the old hardcoded "Coming Soon" cards (docs/UI-UX-AUDIT.md
// Finding 2) — Care Plans, Diagnostics, Medicines and Panchakarma have all
// been fully working since Phases 4-9; this page just never read any of
// them. Every section below is real data, not a placeholder.
export default async function PatientDashboardPage() {
  const session = await requireSessionOrRedirect();
  const [{ profile }, appointments, carePlans, diagnosticOrders, medicineOrders, panchakarmaBookings, tickets] = await Promise.all([
    getMyProfile(session.userId),
    listAppointments(session.userId),
    listCarePlans(session.userId),
    listDiagnosticOrders(session.userId),
    listMedicineOrders(session.userId),
    listPanchakarmaBookings(session.userId),
    listSupportTickets(session.userId),
  ]);

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'there';
  const upcoming = appointments
    .filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT')
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const nextAppointment = upcoming[0];

  const activeCarePlans = carePlans.filter((p) => p.status === 'ACTIVE');
  const pendingDiagnostics = diagnosticOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const readyReports = diagnosticOrders.filter((o) => o.report?.releasedToPatientAt);
  const activeMedicineOrders = medicineOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
  const activePanchakarma = panchakarmaBookings.filter((b) => b.status === 'BOOKED' || b.status === 'SCHEDULED' || b.status === 'IN_PROGRESS');
  const openTickets = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Welcome, {name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Here&apos;s what&apos;s happening with your care today.</p>

      {/* Next appointment — the primary thing on this dashboard, not one card among equals. */}
      <Card className="mt-6 border-brand-purple-200 bg-brand-purple-50/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Next appointment</CardTitle>
            {nextAppointment ? (
              <>
                <CardDescription>
                  {new Date(nextAppointment.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                  {nextAppointment.mode}
                </CardDescription>
              </>
            ) : (
              <CardDescription>No upcoming appointment — find a verified doctor and book your next visit.</CardDescription>
            )}
          </div>
          {nextAppointment && <AppointmentStatusBadge status={nextAppointment.status} />}
        </div>
        <Link
          href={nextAppointment ? '/patient/appointments' : '/doctors'}
          className="mt-3 inline-block text-sm font-medium text-brand-purple-600"
        >
          {nextAppointment ? 'View appointment' : 'Find a doctor'} →
        </Link>
      </Card>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardTitle className="text-base">Active care plan{activeCarePlans.length !== 1 ? 's' : ''}</CardTitle>
          {activeCarePlans.length === 0 ? (
            <CardDescription>Your practitioner will start one after a consultation.</CardDescription>
          ) : (
            <>
              <CardDescription>{activeCarePlans[0]!.summary || 'Treatment plan in progress.'}</CardDescription>
              <p className="mt-2 text-xs text-brand-neutral-400">
                {activeCarePlans[0]!.items.filter((i) => i.status === 'COMPLETED').length} of {activeCarePlans[0]!.items.length} steps
                complete
              </p>
            </>
          )}
          <Link href="/patient/care-plans" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            View care plans →
          </Link>
        </Card>

        <Card>
          <CardTitle className="text-base">Diagnostics</CardTitle>
          <CardDescription>
            {pendingDiagnostics.length > 0
              ? `${pendingDiagnostics.length} test${pendingDiagnostics.length !== 1 ? 's' : ''} in progress.`
              : readyReports.length > 0
                ? `${readyReports.length} report${readyReports.length !== 1 ? 's' : ''} ready to view.`
                : 'No diagnostic tests booked yet.'}
          </CardDescription>
          <Link href="/patient/diagnostics" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            View diagnostics →
          </Link>
        </Card>

        <Card>
          <CardTitle className="text-base">Medicine orders</CardTitle>
          {activeMedicineOrders.length === 0 ? (
            <CardDescription>No medicine orders in progress.</CardDescription>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <MedicineOrderStatusBadge status={activeMedicineOrders[0]!.status} />
              <span className="text-xs text-brand-neutral-400">
                {activeMedicineOrders.length} order{activeMedicineOrders.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <Link href="/patient/medicines" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            View medicines →
          </Link>
        </Card>

        <Card>
          <CardTitle className="text-base">Panchakarma</CardTitle>
          {activePanchakarma.length === 0 ? (
            <CardDescription>No Panchakarma course booked yet.</CardDescription>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <PanchakarmaBookingStatusBadge status={activePanchakarma[0]!.status} />
              <span className="text-xs text-brand-neutral-400">
                {activePanchakarma[0]!.sessions.filter((s) => s.attendedAt).length}/{activePanchakarma[0]!.sessionCount} sessions
              </span>
            </div>
          )}
          <Link href="/patient/panchakarma" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            View Panchakarma →
          </Link>
        </Card>

        <Card>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            {profile.firstName ? 'Your profile is filled in.' : 'Add your name and health details so practitioners have context.'}
          </CardDescription>
          <Link href="/patient/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {profile.firstName ? 'Edit profile' : 'Complete your profile'} →
          </Link>
        </Card>

        <Card>
          <CardTitle className="text-base">Family ({profile.familyMembers.length})</CardTitle>
          <CardDescription>
            {profile.familyMembers.length ? 'Manage who you book care for.' : 'Add a parent, spouse, child or dependent to book care on their behalf.'}
          </CardDescription>
          <Link href="/patient/family" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage family →
          </Link>
        </Card>
      </div>

      {openTickets.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Support</h2>
          <Card className="mt-3">
            <CardTitle className="text-base">
              {openTickets.length} open ticket{openTickets.length !== 1 ? 's' : ''}
            </CardTitle>
            <CardDescription>{openTickets[0]!.subject}</CardDescription>
            <Link href="/patient/support" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              View support →
            </Link>
          </Card>
        </div>
      )}

      {carePlans.length === 0 && diagnosticOrders.length === 0 && medicineOrders.length === 0 && panchakarmaBookings.length === 0 && (
        <EmptyState
          message="Your care history will show up here after your first consultation."
          action={{ label: 'Find a doctor', href: '/doctors' }}
        />
      )}
    </div>
  );
}
