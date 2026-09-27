import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { VerificationBadge } from '@/components/ui/badge';
import { listMineAsDoctor } from '@/modules/appointments/appointments.service';
import { listTasksNeedingAttention } from '@/modules/consultations/consultations.service';
import { getMe } from '@/modules/doctors/doctors.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { SubmitButton } from './submit-button';

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default async function DoctorOverviewPage() {
  const session = await requireSessionOrRedirect();
  const { profile, completion } = await getMe(session.userId);
  const editable = profile.verificationStatus === 'DRAFT' || profile.verificationStatus === 'REJECTED';
  const approved = profile.verificationStatus === 'APPROVED';

  const [appointments, tasks] = approved
    ? await Promise.all([listMineAsDoctor(session.userId), listTasksNeedingAttention(session.userId)])
    : [[], []];

  const today = new Date();
  const todaysSchedule = appointments
    .filter((a) => (a.status === 'CONFIRMED' || a.status === 'COMPLETED') && isSameDay(new Date(a.scheduledAt), today))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextPatient = todaysSchedule.find((a) => a.status === 'CONFIRMED');
  const upcomingCount = appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT').length;

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
            <div className="h-full rounded-full bg-brand-purple-500 transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
      )}

      {editable && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Qualifications, specialties, fees.</CardDescription>
              <Link href="/doctor/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                Edit →
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
          </div>
          <div className="mt-8">
            <SubmitButton />
          </div>
        </>
      )}

      {approved && (
        <>
          {/* Next patient — the primary thing on a clinical dashboard, not one card among profile links. */}
          <Card className="mt-6 border-brand-purple-200 bg-brand-purple-50/40">
            <CardTitle>Next patient</CardTitle>
            {nextPatient ? (
              <>
                <CardDescription>
                  {[nextPatient.patientUser.patientProfile?.firstName, nextPatient.patientUser.patientProfile?.lastName]
                    .filter(Boolean)
                    .join(' ') || nextPatient.patientUser.mobile}{' '}
                  · {new Date(nextPatient.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} ·{' '}
                  {nextPatient.mode}
                </CardDescription>
                <Link
                  href={nextPatient.consultation ? `/doctor/consultations/${nextPatient.consultation.id}` : '/doctor/appointments'}
                  className="mt-3 inline-block text-sm font-medium text-brand-purple-600"
                >
                  Start consultation →
                </Link>
              </>
            ) : (
              <CardDescription>No confirmed patients waiting today.</CardDescription>
            )}
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Today&apos;s schedule</h2>
              {todaysSchedule.length === 0 ? (
                <EmptyState message="No appointments today." />
              ) : (
                <ul className="mt-3 space-y-2">
                  {todaysSchedule.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-3 text-sm">
                      <div>
                        <p className="font-medium text-brand-neutral-900">
                          {[a.patientUser.patientProfile?.firstName, a.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
                            a.patientUser.mobile}
                        </p>
                        <p className="text-xs text-brand-neutral-500">
                          {new Date(a.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {a.mode}
                        </p>
                      </div>
                      {a.consultation && (
                        <Link href={`/doctor/consultations/${a.consultation.id}`} className="text-sm font-medium text-brand-purple-600">
                          {a.status === 'COMPLETED' ? 'View' : 'Start'} →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Tasks requiring attention</h2>
              {tasks.length === 0 ? (
                <EmptyState message="Nothing needs your attention." />
              ) : (
                <ul className="mt-3 space-y-2">
                  {tasks.map((t) => (
                    <li key={t.consultationId} className="flex items-center justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-3 text-sm">
                      <div>
                        <p className="font-medium text-brand-neutral-900">{t.patientName}</p>
                        <p className="text-xs text-brand-orange-600">{t.reason}</p>
                      </div>
                      <Link href={`/doctor/consultations/${t.consultationId}`} className="text-sm font-medium text-brand-purple-600">
                        Resolve →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardTitle className="text-base">Appointments ({upcomingCount} upcoming)</CardTitle>
              <Link href="/doctor/appointments" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                View all →
              </Link>
            </Card>
            <Card>
              <CardTitle className="text-base">Profile</CardTitle>
              <Link href="/doctor/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                View →
              </Link>
            </Card>
            <Card>
              <CardTitle className="text-base">Clinics ({profile.clinics.length})</CardTitle>
              <Link href="/doctor/clinics" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                Manage →
              </Link>
            </Card>
            <Card>
              <CardTitle className="text-base">Availability ({profile.availability.length})</CardTitle>
              <Link href="/doctor/availability" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
                Manage →
              </Link>
            </Card>
          </div>
        </>
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
