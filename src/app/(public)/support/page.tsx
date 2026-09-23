import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Support — ABIES' };

const AREAS = [
  { title: 'Booking & scheduling', body: 'Appointment issues, rescheduling, cancellations.' },
  { title: 'Payments & refunds', body: 'Failed payments, refund status, billing disputes.' },
  { title: 'Diagnostics & medicines', body: 'Sample collection issues, delivery delays, order status.' },
  { title: 'Clinical safety concerns', body: 'Routed to a clinical escalation queue, separate from routine support — never handled by AI alone.' },
];

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue-600">Support</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">How we&apos;ll help</h1>
      <p className="mt-4 max-w-2xl text-brand-neutral-600">
        Support is built around your actual bookings, orders and care plan — an agent handling your
        ticket sees your history in one place instead of asking you to repeat it.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {AREAS.map((a) => (
          <Card key={a.title}>
            <CardTitle className="text-base">{a.title}</CardTitle>
            <CardDescription>{a.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mt-10">
        The support ticketing console isn&apos;t connected yet — see{' '}
        <a href="/contact" className="text-brand-purple-600 underline">
          Contact
        </a>{' '}
        for current status.
      </Alert>
    </main>
  );
}
