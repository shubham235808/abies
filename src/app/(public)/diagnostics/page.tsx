import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Diagnostics — ABIES' };

const STEPS = [
  { title: 'Practitioner recommends', body: 'A test is ordered as part of your Care Plan, with a documented clinical reason — not sold to you independently.' },
  { title: 'You choose a verified lab', body: 'Home collection or in-lab visit, from labs reviewed for licensing, collection coverage and turnaround time.' },
  { title: 'Sample lifecycle tracked', body: 'Booked → collected → processing → report — visible at every step, not just at the end.' },
  { title: 'Report reaches both of you', body: 'You and your ordering practitioner are notified together, so results feed back into your care plan.' },
];

export default function DiagnosticsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue-600">Diagnostics</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">
        Clinician-ordered tests, not indiscriminate test-selling
      </h1>
      <p className="mt-4 max-w-2xl text-brand-neutral-600">
        Diagnostics on ABIES are integrated as practitioner-ordered services with a documented clinical
        reason, routed through labs that have been verified for accreditation, collection coverage and
        turnaround time.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <Card key={s.title}>
            <CardTitle className="text-base">{s.title}</CardTitle>
            <CardDescription>{s.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mt-10">
        Lab partner onboarding and the test-booking workflow are a later build phase — this page
        describes how it will work, not a service you can book yet.
      </Alert>
    </main>
  );
}
