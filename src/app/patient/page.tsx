import Link from 'next/link';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { listMineAsPatient } from '@/modules/appointments/appointments.service';
import { getMyProfile } from '@/modules/patients/patients.service';
import { requireSessionOrRedirect } from '@/server/current-user';

const COMING_SOON = [
  { title: 'Active care plan', body: 'Your practitioner-authored treatment timeline.' },
  { title: 'Pending diagnostics', body: 'Clinician-ordered tests and reports.' },
  { title: 'Medicine deliveries', body: 'Prescription fulfilment and tracking.' },
];

export default async function PatientDashboardPage() {
  const session = await requireSessionOrRedirect();
  const [{ profile }, appointments] = await Promise.all([getMyProfile(session.userId), listMineAsPatient(session.userId)]);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'there';
  const upcoming = appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT');

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Welcome, {name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">Here&apos;s what&apos;s real on your account today.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Appointments ({upcoming.length} upcoming)</CardTitle>
          <CardDescription>
            {upcoming.length ? 'Manage your upcoming visits.' : 'Find a verified doctor and book your first visit.'}
          </CardDescription>
          <Link href={upcoming.length ? '/patient/appointments' : '/doctors'} className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {upcoming.length ? 'View appointments' : 'Find a doctor'} →
          </Link>
        </Card>
        <Card>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {profile.firstName
              ? 'Your profile is filled in.'
              : 'Add your name and health details so practitioners have context.'}
          </CardDescription>
          <Link href="/patient/profile" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            {profile.firstName ? 'Edit profile' : 'Complete your profile'} →
          </Link>
        </Card>
        <Card>
          <CardTitle>Family ({profile.familyMembers.length})</CardTitle>
          <CardDescription>
            {profile.familyMembers.length
              ? 'Manage who you book care for.'
              : 'Add a parent, spouse, child or dependent to book care on their behalf.'}
          </CardDescription>
          <Link href="/patient/family" className="mt-3 inline-block text-sm font-medium text-brand-purple-600">
            Manage family →
          </Link>
        </Card>
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Coming soon</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {COMING_SOON.map((item) => (
          <Card key={item.title} className="opacity-70">
            <CardTitle className="text-base">{item.title}</CardTitle>
            <CardDescription>{item.body}</CardDescription>
          </Card>
        ))}
      </div>
    </div>
  );
}
