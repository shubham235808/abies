// Public homepage. Per the build brief's No-Fake-Functionality policy: no
// call-to-action here pretends to do something the backend doesn't yet
// support. Sign-in, doctor discovery and appointment booking (Phase 4) are
// all real — their CTAs link to working pages. Booking itself still
// requires Razorpay keys to be configured in this environment; that's
// surfaced honestly on the doctor profile page, not hidden here.
import Link from 'next/link';
import { PromotionBanner } from '@/components/promotions/promotion-banner';
import { activePromotionsForPlacement } from '@/modules/promotions/promotions.service';

// Promotions change over time and read from the database — never
// prerendered at build time (the build stage has no DB to query), same
// rule already applied to /diagnostics and /doctors.
export const dynamic = 'force-dynamic';

type Accent = 'purple' | 'magenta' | 'blue' | 'orange';

const ACCENT_CLASSES: Record<Accent, { chip: string; icon: React.ReactNode }> = {
  purple: {
    chip: 'bg-brand-purple-100 text-brand-purple-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M10 2.5 4 5v4.5c0 4 2.6 6.9 6 7.5 3.4-.6 6-3.5 6-7.5V5l-6-2.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="m7.5 10 1.8 1.8L12.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  magenta: {
    chip: 'bg-brand-magenta-100 text-brand-magenta-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <circle cx="10" cy="4.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="4.5" cy="14" r="1.75" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15.5" cy="14" r="1.75" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6.25V10m0 0-5.5 4m5.5-4 5.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  blue: {
    chip: 'bg-brand-blue-100 text-brand-blue-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <path d="M8 2.5h4M9 2.5v5.2L5.3 14a1.5 1.5 0 0 0 1.3 2.3h6.8a1.5 1.5 0 0 0 1.3-2.3L11 7.7V2.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  orange: {
    chip: 'bg-brand-orange-100 text-brand-orange-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M4 10a6 6 0 0 1 10.2-4.2M16 10a6 6 0 0 1-10.2 4.2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M14.2 3v3h-3M5.8 17v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

const PILLARS: { title: string; body: string; accent: Accent }[] = [
  {
    title: 'Verified practitioners',
    body: 'Every Ayurveda doctor is reviewed against their registration council and qualification documents before appearing in search.',
    accent: 'purple',
  },
  {
    title: 'One coordinated care plan',
    body: 'Consultations, diagnostics, medicines, Panchakarma and follow-up are organised around a single treatment timeline, not disconnected bookings.',
    accent: 'magenta',
  },
  {
    title: 'Diagnostics, done properly',
    body: 'Clinician-ordered tests route through verified labs, with results returned to both you and your practitioner.',
    accent: 'blue',
  },
  {
    title: 'Continuous follow-up',
    body: 'Reminders and care coordination keep your treatment on track between visits.',
    accent: 'orange',
  },
];

const SERVICES: { title: string; body: string; href: string }[] = [
  { title: 'Consult an Ayurveda doctor', body: 'Video or in-clinic, with verified credentials and real availability.', href: '/doctors' },
  { title: 'Book diagnostic tests', body: 'Home collection or lab visit, results returned to you and your doctor.', href: '/diagnostics' },
  { title: 'Order Ayurvedic medicines', body: 'Prescription-linked or over-the-counter, from verified pharmacies.', href: '/medicines' },
  { title: 'Discover Panchakarma centres', body: 'Book verified therapy courses, with your doctor’s recommendation carried through.', href: '/panchakarma' },
  { title: 'Manage your care plan', body: 'One treatment timeline across every consultation, test and therapy.', href: '/login' },
  { title: 'Access reports & prescriptions', body: 'Every document your care has produced, in one place.', href: '/login' },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Discover the right care', body: 'Search verified doctors by specialty, language and consultation mode.' },
  { step: '2', title: 'Consult verified professionals', body: 'Video or in-clinic — your practitioner sees your history, not a blank form.' },
  { step: '3', title: 'Receive your care plan', body: 'Prescriptions, diagnostics and next steps organised around one timeline.' },
  { step: '4', title: 'Book diagnostics or therapy', body: 'Tests and Panchakarma sessions booked against your doctor’s recommendation.' },
  { step: '5', title: 'Order medicines', body: 'Fulfilled by a verified pharmacy, tracked to delivery.' },
  { step: '6', title: 'Track your health journey', body: 'Every visit, report and order in one patient dashboard.' },
];

// EXPANSION-1d — reference UI shows a lifestyle/family photograph here; no
// such licensed asset exists in this repo (docs/EXPANSION-1-VISUAL-GAP-ANALYSIS.md
// open item #4), so this is a hand-drawn gradient/illustration placeholder
// instead of fabricated or unlicensed stock photography, matching this
// app's existing hand-rolled-SVG precedent.
function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="heroBlob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-purple-200)" />
          <stop offset="100%" stopColor="var(--color-brand-blue-100)" />
        </linearGradient>
        <linearGradient id="heroLeaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-purple-600)" />
          <stop offset="100%" stopColor="var(--color-brand-magenta-500)" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="180" fill="url(#heroBlob)" />
      <path
        d="M200 90c60 0 110 50 110 110s-50 110-110 110c0-60 0-160 0-220Z"
        fill="url(#heroLeaf)"
        opacity="0.9"
      />
      <path
        d="M200 90c-60 0-110 50-110 110s50 110 110 110c0-60 0-160 0-220Z"
        fill="url(#heroLeaf)"
        opacity="0.55"
      />
      <path d="M200 90v220" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <circle cx="130" cy="140" r="10" fill="white" opacity="0.7" />
      <circle cx="280" cy="270" r="14" fill="white" opacity="0.5" />
    </svg>
  );
}

const CATEGORY_TILES: { title: string; href: string; accent: Accent }[] = [
  { title: 'Doctors', href: '/doctors', accent: 'purple' },
  { title: 'Medicines', href: '/medicines', accent: 'magenta' },
  { title: 'Diagnostics', href: '/diagnostics', accent: 'blue' },
  { title: 'Panchakarma', href: '/panchakarma', accent: 'orange' },
];

export default async function HomePage() {
  const [heroPromotion] = await activePromotionsForPlacement('PUBLIC_HOME_HERO', {}, 1);

  return (
    <main>
      <div className="bg-gradient-to-br from-brand-purple-50 via-white to-brand-blue-50">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 pb-10 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">
              Care orchestration platform
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-brand-neutral-900 sm:text-5xl">
              Trusted, coordinated{' '}
              <span className="bg-gradient-to-r from-brand-purple-600 to-brand-magenta-500 bg-clip-text text-transparent">
                Ayurveda care
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-brand-neutral-600">
              ABIES connects patients with verified Ayurveda practitioners, diagnostics, medicine
              fulfilment and Panchakarma centres through one coordinated treatment journey — not a
              set of disconnected bookings.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/doctors"
                className="rounded-lg bg-brand-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-purple-700"
              >
                Find a doctor
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-brand-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-brand-neutral-700 hover:bg-brand-neutral-50"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="mx-auto aspect-square w-full max-w-sm">
            <HeroIllustration />
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 pb-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORY_TILES.map((tile) => (
              <Link
                key={tile.title}
                href={tile.href}
                className="flex flex-col items-center gap-2 rounded-card border border-brand-neutral-200 bg-white p-4 text-center shadow-sm transition-colors hover:border-brand-purple-300"
              >
                <span className={`inline-flex rounded-lg p-2 ${ACCENT_CLASSES[tile.accent].chip}`}>
                  {ACCENT_CLASSES[tile.accent].icon}
                </span>
                <span className="text-sm font-medium text-brand-neutral-900">{tile.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        {heroPromotion && (
          <div className="mt-4">
            <PromotionBanner promotion={heroPromotion ?? null} />
          </div>
        )}

        <h2 className="mt-4 text-2xl font-semibold text-brand-neutral-900">Everything your care needs, in one place</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <Link
              key={service.title}
              href={service.href}
              className="block rounded-card border border-brand-neutral-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-purple-300"
            >
              <p className="font-semibold text-brand-neutral-900">{service.title}</p>
              <p className="mt-1.5 text-sm text-brand-neutral-600">{service.body}</p>
            </Link>
          ))}
        </div>

        <h2 className="mt-16 text-2xl font-semibold text-brand-neutral-900">How ABIES works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-purple-100 text-sm font-semibold text-brand-purple-700">
                {item.step}
              </span>
              <div>
                <p className="font-medium text-brand-neutral-900">{item.title}</p>
                <p className="mt-1 text-sm text-brand-neutral-600">{item.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-16 text-2xl font-semibold text-brand-neutral-900">Why ABIES</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-card border border-brand-neutral-200 bg-white p-6 shadow-sm"
            >
              <div className={`inline-flex rounded-lg p-2 ${ACCENT_CLASSES[pillar.accent].chip}`}>
                {ACCENT_CLASSES[pillar.accent].icon}
              </div>
              <dt className="mt-4 font-semibold text-brand-neutral-900">{pillar.title}</dt>
              <dd className="mt-2 text-sm text-brand-neutral-600">{pillar.body}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-16 text-2xl font-semibold text-brand-neutral-900">Partner with ABIES</h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-neutral-600">
          ABIES verifies every partner before they can receive referrals or appear to patients.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'For Doctors', body: 'Bring your practice onto a platform that handles scheduling and records for you.' },
            { title: 'For Diagnostic Labs', body: 'Receive practitioner-ordered tests with clear clinical context.' },
            { title: 'For Pharmacies', body: 'Fulfil prescription-linked orders with batch/expiry tracking.' },
            { title: 'For Panchakarma Centres', body: 'Receive qualified referrals with documented prerequisites.' },
          ].map((p) => (
            <Link
              key={p.title}
              href="/partners"
              className="block rounded-card border border-brand-neutral-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-purple-300"
            >
              <p className="font-semibold text-brand-neutral-900">{p.title}</p>
              <p className="mt-1.5 text-sm text-brand-neutral-600">{p.body}</p>
            </Link>
          ))}
        </div>

        <p className="mt-14 border-t border-brand-neutral-200 pt-6 text-xs text-brand-neutral-400">
          ABIES is a care-coordination platform, not a substitute for professional medical
          judgement. Clinical decisions are made by qualified, verified practitioners.
        </p>
      </div>
    </main>
  );
}
