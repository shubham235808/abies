import Link from 'next/link';
import { Alert } from '@abies/design-system/components/ui/alert';
import { HoverCard } from '@abies/design-system/components/ui/card';
import { FaqAccordion } from './faq-accordion';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('support');
}

const AREAS = [
  { icon: '💬', title: 'Customer Support', body: 'Bookings, payments, refunds, delivery and general account help.' },
  { icon: '🤝', title: 'Sales & Partnerships', body: 'Doctor, centre, lab, pharmacy and corporate onboarding.' },
  { icon: '🛠️', title: 'Technical Support', body: 'Login, video consultation, report upload or platform access issues.' },
  {
    icon: '🩺',
    title: 'Care Coordination',
    body: 'Scheduling and care-plan coordination. Clinical decisions remain with the practitioner, routed with priority response — not handled by AI alone.',
  },
];

const FAQS = [
  {
    q: 'Can support change my prescription?',
    a: 'No. Support and AI workflows cannot alter clinical decisions or prescriptions. Only the treating practitioner can do that.',
  },
  {
    q: 'How do refunds work?',
    a: 'Refund eligibility depends on the booking/order state. Support can initiate and track the workflow from your patient timeline.',
  },
  {
    q: 'I cannot join a video consultation. What should I do?',
    a: 'Use Technical Support. Live video calling is not connected to a provider in this environment yet — coordinate directly with your doctor for now.',
  },
  {
    q: 'How do I onboard my clinic or centre?',
    a: 'Use Sales & Partnerships and submit your organisation details from the Partners page. The onboarding team verifies credentials and facility information.',
  },
];

export default function SupportPage() {
  return (
    <main>
      <div className="bg-gradient-to-b from-[#fff7fd] to-white">
        <div className="mx-auto max-w-5xl px-6 pb-10 pt-[54px]">
          <span className="text-sm font-bold text-brand-purple-700">Home / Support</span>
          <h1 className="mt-2.5 text-[clamp(36px,4vw,52px)] font-extrabold tracking-tight text-brand-neutral-900">How can ABIES help?</h1>
          <p className="mt-1 max-w-2xl text-brand-neutral-500">
            Customer care, sales, technical support and care coordination work from the same
            timeline — support is built around your actual bookings, orders and care plan, so an
            agent sees your history in one place instead of asking you to repeat it.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AREAS.map((a) => (
            <HoverCard key={a.title} className="p-5">
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-control bg-brand-purple-50 text-2xl">
                {a.icon}
              </div>
              <p className="mt-3.5 font-bold text-brand-neutral-900">{a.title}</p>
              <p className="mt-1 text-sm text-brand-neutral-500">{a.body}</p>
            </HoverCard>
          ))}
        </div>

        <Alert tone="info" className="mt-8">
          Signed-in patients can open and track a ticket from{' '}
          <Link href="/patient/support" className="font-medium text-brand-purple-700 underline">
            Patient → Support
          </Link>
          . Not signed in yet?{' '}
          <Link href="/login" className="font-medium text-brand-purple-700 underline">
            Log in
          </Link>{' '}
          first.
        </Alert>

        <h2 className="mt-14 text-[clamp(26px,3vw,32px)] font-extrabold tracking-tight text-brand-neutral-900">
          Frequently asked questions
        </h2>
        <FaqAccordion items={FAQS} />
      </div>
    </main>
  );
}
