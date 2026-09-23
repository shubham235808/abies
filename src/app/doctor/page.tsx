import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { VerificationBadge } from '@/components/ui/badge';
import { listMineAsDoctor } from '@/modules/appointments/appointments.service';
import { getMe } from '@/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

export default async function DoctorOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { profile, completion } = await getMe(session.userId);
  const editable = profile.verificationStatus === 'DRAFT' || profile.verificationStatus === 'REJECTED';
  const upcomingAppointments =
    profile.verificationStatus === 'APPROVED'
      ? (await listMineAsDoctor(session.userId)).filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT').length
      : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-brand-neutral-900">
          {profile.firstName ? `Dr. ${profile.firstName} ${profile.lastName}` : 'Your application'}
        </h1>
        <VerificationBadge status={profile.verificationStatus} />
      </div>

      {profile.verificationStatus === 'REJECTED' && profile.rejectionReason && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your last application was rejected: {profile.rejectionReason}. Update your details below and
          resubmit.
        </p>
      )}
      {profile.verificationStatus === 'SUBMITTED' || profile.verificationStatus === 'UNDER_REVIEW' ? (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          Your application is with the ABIES verification team. You&apos;ll be notified once it&apos;s
          reviewed.
        </p>
      ) : null}
      {profile.verificationStatus === 'APPROVED' && (
        <p className="mt-3 max-w-2xl text-sm text-brand-neutral-600">
          You&apos;re verified and visible to patients in search.
        </p>
      )}
      {profile.verificationStatus === 'SUSPENDED' && (
        <p className="mt-3 max-w-2xl rounded-lg border border-brand-magenta-200 bg-brand-magenta-50 px-4 py-3 text-sm text-brand-magenta-800">
          Your account has been suspended{profile.rejectionReason ? `: ${profile.rejectionReason}` : '.'} Contact
          ABIES support.
        </p>
      )}

      {editable && (
        <div className="mt-6 max-w-md">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-brand-neutral-600">Application completeness</span>
            <span className="font-medium text-brand-neutral-900">{completion}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-brand-neutral-100">
            <div
              className="h-full rounded-full bg-brand-purple-500 transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Qualifications, specialties, fees.</CardDescription>
          <Link href="/doctor/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {editable ? 'Edit' : 'View'} →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Documents ({profile.documents.length})</CardTitle>
          <CardDescription>Registration and degree certificates.</CardDescription>
          <Link href="/doctor/documents" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Clinics ({profile.clinics.length})</CardTitle>
          <CardDescription>Where you see patients in person.</CardDescription>
          <Link href="/doctor/clinics" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        <Card>
          <CardTitle className="text-base">Availability ({profile.availability.length})</CardTitle>
          <CardDescription>Weekly consultation slots.</CardDescription>
          <Link href="/doctor/availability" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage →
          </Link>
        </Card>
        {profile.verificationStatus === 'APPROVED' && (
          <Card>
            <CardTitle className="text-base">Appointments ({upcomingAppointments} upcoming)</CardTitle>
            <CardDescription>Patients who&apos;ve booked against your availability.</CardDescription>
            <Link href="/doctor/appointments" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
              View →
            </Link>
          </Card>
        )}
      </div>

      {editable && (
        <div className="mt-8">
          <SubmitButton />
        </div>
      )}

      {profile.verificationActions.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">
            Verification history
          </h2>
          <ul className="mt-3 space-y-2">
            {profile.verificationActions.map((a) => (
              <li key={a.id} className="text-sm text-brand-neutral-600">
                <span className="font-medium text-brand-neutral-900">{a.toStatus.replace(/_/g, ' ')}</span>
                {' — '}
                {new Date(a.createdAt).toLocaleString()}
                {a.notes ? ` — ${a.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
