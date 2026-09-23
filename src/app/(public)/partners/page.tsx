import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Partner with ABIES' };

const PARTNER_TYPES = [
  { title: 'Ayurveda doctors & clinics', body: 'Bring your practice onto a platform that handles scheduling, records and patient communication for you.' },
  { title: 'Diagnostic labs', body: 'Receive practitioner-ordered tests with clear clinical context, not indiscriminate demand.' },
  { title: 'Pharmacies', body: 'Fulfil prescription-linked orders with batch/expiry tracking and no silent-substitution disputes.' },
  { title: 'Panchakarma centres', body: 'Receive qualified referrals with documented prerequisites, not walk-in guesswork.' },
];

export default function PartnersPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">Partners</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">
        Join the ABIES care network
      </h1>
      <p className="mt-4 max-w-2xl text-brand-neutral-600">
        ABIES verifies every partner before they can receive referrals or appear to patients — quality
        and credential checks first, commercial terms second.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PARTNER_TYPES.map((p) => (
          <Card key={p.title}>
            <CardTitle className="text-base">{p.title}</CardTitle>
            <CardDescription>{p.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mt-10">
        Doctor sign-up already works — see{' '}
        <a href="/login" className="text-brand-purple-600 underline">
          Sign in
        </a>{' '}
        and choose &ldquo;Doctor / Vaidya&rdquo;. Partner onboarding for labs, pharmacies and Panchakarma
        centres is a later build phase; a lead-capture form will replace this notice once the sales
        console ships.
      </Alert>
    </main>
  );
}
