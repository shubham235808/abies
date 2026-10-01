import Link from 'next/link';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Partner with ABIES' };

// Each bullet names a real, already-built capability of that portal (not
// marketing copy) — doctors get profile/documents/clinics/availability
// management, labs get tests/packages/bookings/report upload, etc.
const PARTNER_TYPES = [
  {
    icon: '🩺',
    title: 'Doctors & Clinics',
    bullets: ['Verified profile', 'Availability & appointments', 'Digital consultation notes', 'Prescriptions & care plans', 'Patient timeline'],
  },
  {
    icon: '🪷',
    title: 'Panchakarma Centres',
    bullets: ['Facility verification', 'Treatment catalogue', 'Referral intake', 'Session scheduling', 'Earnings & settlement history'],
  },
  {
    icon: '🧪',
    title: 'Diagnostic Labs',
    bullets: ['Test & package catalogue', 'Home collection slots', 'Order workflow', 'Secure report upload', 'Settlement history'],
  },
  {
    icon: '💊',
    title: 'Pharmacy Partners',
    bullets: ['Prescription fulfilment', 'Batch & expiry tracking', 'Stock movement ledger', 'Order tracking', 'POS for in-store sales'],
  },
];

export default function PartnersPage() {
  return (
    <main>
      <div className="bg-gradient-to-b from-[#fff7fd] to-white">
        <div className="mx-auto max-w-5xl px-6 pb-10 pt-[54px]">
          <span className="text-sm font-bold text-brand-purple-700">ABIES Partner Network</span>
          <h1 className="mt-2.5 text-[clamp(36px,4vw,52px)] font-extrabold tracking-tight text-brand-neutral-900">
            Bring your practice onto one care network.
          </h1>
          <p className="mt-1 max-w-2xl text-brand-neutral-500">
            ABIES verifies every partner before they can receive referrals or appear to patients —
            quality and credential checks first, commercial terms second.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <div className="grid gap-5 sm:grid-cols-2">
          {PARTNER_TYPES.map((p) => (
            <div key={p.title} className="rounded-card border border-brand-neutral-200 bg-white p-6">
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-control bg-brand-purple-50 text-2xl">
                {p.icon}
              </div>
              <h2 className="mt-3.5 text-xl font-extrabold text-brand-neutral-900">{p.title}</h2>
              <ul className="mt-3 space-y-1.5 pl-5 text-sm text-brand-neutral-500">
                {p.bullets.map((b) => (
                  <li key={b} className="list-disc">
                    {b}
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className="mt-4 inline-block rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-[18px] py-2.5 text-sm font-bold text-white shadow-[0_8px_22px_rgba(166,10,128,0.18)]"
              >
                Start onboarding
              </Link>
            </div>
          ))}
        </div>

        <Alert tone="info" className="mt-8">
          Doctors, diagnostic labs, pharmacies and Panchakarma centres can all register directly — see{' '}
          <Link href="/login" className="font-medium text-brand-purple-700 underline">
            Sign in
          </Link>{' '}
          and choose your role. Your account starts in draft while our verification team reviews your
          credentials, and you won&apos;t appear to patients until that&apos;s complete.
        </Alert>
      </div>
    </main>
  );
}
