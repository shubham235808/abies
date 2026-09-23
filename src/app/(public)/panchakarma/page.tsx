import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Panchakarma — ABIES' };

const PRINCIPLES = [
  { title: 'Referred, not self-selected', body: 'A therapy course starts from your practitioner’s referral, with parameters and prerequisites documented.' },
  { title: 'Verified centres only', body: 'Facility supervision, staff, hygiene processes and required licences are reviewed before a centre is listed.' },
  { title: 'Session-by-session tracking', body: 'Attendance, therapist, procedure notes and any exceptions are recorded and visible to your referring practitioner.' },
  { title: 'Progress feeds back', body: 'Course completion is reviewed at your next follow-up, not left as a disconnected booking.' },
];

export default function PanchakarmaPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-purple-600">Panchakarma</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">
        A supervised clinical service, not a spa booking
      </h1>
      <p className="mt-4 max-w-2xl text-brand-neutral-600">
        Panchakarma on ABIES is treated as a referred clinical service: a practitioner recommends it,
        you choose from verified centres, and each session is documented back into your care plan.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <Card key={p.title}>
            <CardTitle className="text-base">{p.title}</CardTitle>
            <CardDescription>{p.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mt-10">
        Panchakarma centre onboarding and session booking are a later build phase — this page describes
        how it will work, not a service you can book yet.
      </Alert>
    </main>
  );
}
