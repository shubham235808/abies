// Public homepage. Per the build brief's No-Fake-Functionality policy: no
// call-to-action here pretends to do something the backend doesn't yet
// support. Sign-in, doctor discovery and appointment booking (Phase 4) are
// all real — their CTAs link to working pages. Booking itself still
// requires Razorpay keys to be configured in this environment; that's
// surfaced honestly on the doctor profile page, not hidden here.
import Link from 'next/link';
import { PromotionBanner } from '@/components/promotions/promotion-banner';
import { TestimonialsSection } from '@/components/content/testimonials-section';
import { activePromotionsForPlacement } from '@abies/domain/modules/promotions/promotions.service';
import { activeTestimonials } from '@abies/domain/modules/content/testimonials.service';
import { currentContentLanguage } from '@/lib/content-language';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('home');
}

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

// The reference prototype's hero panel — a "your care plan" timeline
// card. Explicitly labelled as an example here (not "YOUR care plan" as
// the prototype's own mock copy has it): the real homepage is seen by
// anonymous visitors and logged-in patients alike, and this is a product
// illustration of what coordinated care looks like, not a claim about
// the viewer's own (possibly nonexistent) care plan — no fake per-user
// data, per this project's standing no-fabrication rule.
const CARE_PLAN_EXAMPLE: { icon: string; label: string; sub: string; done: boolean }[] = [
  { icon: '🩺', label: 'Doctor consultation', sub: 'Completed', done: true },
  { icon: '🧪', label: 'Diagnostics', sub: 'Home collection scheduled', done: false },
  { icon: '💊', label: 'Medicines', sub: 'Delivery in progress', done: false },
  { icon: '🪷', label: 'Panchakarma', sub: '5 sessions planned', done: false },
  { icon: '📋', label: 'Follow-up', sub: 'Doctor review in 3 weeks', done: false },
];

const CATEGORY_TILES: { title: string; href: string; accent: Accent }[] = [
  { title: 'Doctors', href: '/doctors', accent: 'purple' },
  { title: 'Medicines', href: '/medicines', accent: 'magenta' },
  { title: 'Diagnostics', href: '/diagnostics', accent: 'blue' },
  { title: 'Panchakarma', href: '/panchakarma', accent: 'orange' },
];

export default async function HomePage() {
  const [heroPromotion] = await activePromotionsForPlacement('PUBLIC_HOME_HERO', {}, 1);
  const testimonials = await activeTestimonials(6, await currentContentLanguage());

  return (
    <main>
      <div className="relative overflow-hidden bg-gradient-to-b from-white to-[#fff8fd]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full border-[46px] border-brand-magenta-500/[0.07]"
        />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-6 pb-16 pt-[74px] lg:grid-cols-[1.06fr_0.94fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-pill bg-brand-purple-500/[0.07] px-3 py-1.5 text-sm font-bold text-brand-purple-700">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-orange-500" />
              Ayurveda care, connected end-to-end
            </span>
            <h1 className="mt-5 text-[clamp(40px,5vw,64px)] font-extrabold leading-[1.02] tracking-tight text-brand-neutral-900">
              Your complete{' '}
              <span className="bg-gradient-to-r from-brand-purple-500 via-brand-magenta-500 to-brand-orange-500 bg-clip-text text-transparent">
                Ayurveda care journey
              </span>{' '}
              in one place.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-brand-neutral-600">
              Consult verified practitioners, coordinate diagnostics, receive prescribed medicines,
              book Panchakarma therapies and track every step through one secure care plan.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/doctors"
                className="rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 px-[18px] py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(166,10,128,0.18)] transition-transform hover:-translate-y-px"
              >
                Find a verified doctor
              </Link>
              <Link
                href="/panchakarma"
                className="rounded-control border border-brand-neutral-200 bg-white px-[18px] py-3 text-sm font-bold text-brand-purple-700"
              >
                Explore Panchakarma
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-5 text-sm text-brand-neutral-700">
              <span className="flex items-center gap-1.5">
                <b className="text-semantic-success-500">✓</b> Verified practitioners
              </span>
              <span className="flex items-center gap-1.5">
                <b className="text-semantic-success-500">✓</b> Partner quality checks
              </span>
              <span className="flex items-center gap-1.5">
                <b className="text-semantic-success-500">✓</b> Care-plan based follow-up
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="relative z-[2] rounded-[30px] border border-brand-neutral-100 bg-white/95 p-6 shadow-brand">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-neutral-400">Example care plan</p>
              <h3 className="mt-1 text-xl font-semibold text-brand-neutral-900">12-week wellness journey</h3>
              <div className="mt-4 grid gap-2.5">
                {CARE_PLAN_EXAMPLE.map((step) => (
                  <div key={step.label} className="grid grid-cols-[38px_1fr_auto] items-center gap-3 rounded-control border border-brand-neutral-100 bg-white p-3">
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-control bg-brand-purple-50 text-lg">
                      {step.icon}
                    </span>
                    <div>
                      <strong className="block text-sm text-brand-neutral-900">{step.label}</strong>
                      <small className="text-brand-neutral-500">{step.sub}</small>
                    </div>
                    <span
                      className={`rounded-pill px-2 py-1 text-[11px] font-extrabold ${
                        step.done ? 'bg-semantic-success-50 text-semantic-success-700' : 'bg-brand-orange-50 text-brand-orange-700'
                      }`}
                    >
                      {step.done ? 'DONE' : 'NEXT'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-5 -right-5 z-[3] rounded-[18px] bg-gradient-to-br from-brand-blue-500 to-brand-blue-300 px-[18px] py-[15px] text-white shadow-brand">
              <small className="opacity-90">Care coordination</small>
              <strong className="block text-lg">One timeline</strong>
              <span className="text-xs opacity-90">Doctor → Lab → Medicine → Therapy</span>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORY_TILES.map((tile) => (
              <Link
                key={tile.title}
                href={tile.href}
                className="flex flex-col items-center gap-2 rounded-card border border-brand-neutral-200 bg-white p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-purple-200 hover:shadow-brand"
              >
                <span className={`inline-flex rounded-control p-2 ${ACCENT_CLASSES[tile.accent].chip}`}>
                  {ACCENT_CLASSES[tile.accent].icon}
                </span>
                <span className="text-sm font-medium text-brand-neutral-900">{tile.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-16">
        {heroPromotion && (
          <div className="mt-4">
            <PromotionBanner promotion={heroPromotion ?? null} />
          </div>
        )}

        <h2 className="mt-4 text-[clamp(30px,4vw,44px)] font-extrabold tracking-tight text-brand-neutral-900">Everything around the treatment plan.</h2>
        <p className="mt-2 max-w-2xl text-brand-neutral-500">The platform is designed around coordinated care — not disconnected bookings.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <Link
              key={service.title}
              href={service.href}
              className="block min-h-[160px] rounded-card border border-brand-neutral-200 bg-white p-[22px] transition-all hover:-translate-y-1 hover:border-brand-purple-200 hover:shadow-brand"
            >
              <p className="font-bold text-brand-neutral-900">{service.title}</p>
              <p className="mt-2 text-sm text-brand-neutral-500">{service.body}</p>
            </Link>
          ))}
        </div>

        <h2 className="mt-16 text-2xl font-semibold text-brand-neutral-900">How ABIES works</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step} className="rounded-card border border-brand-neutral-200 bg-white p-[22px]">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-gradient-to-br from-brand-purple-500 to-brand-magenta-500 text-sm font-extrabold text-white">
                {item.step}
              </span>
              <p className="mt-3.5 font-bold text-brand-neutral-900">{item.title}</p>
              <p className="mt-1 text-sm text-brand-neutral-500">{item.body}</p>
            </li>
          ))}
        </ol>

        <h2 className="mt-16 text-[clamp(30px,4vw,44px)] font-extrabold tracking-tight text-brand-neutral-900">Why ABIES</h2>
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-card border border-brand-neutral-200 bg-white p-6 transition-all hover:-translate-y-1 hover:shadow-brand"
            >
              <div className={`inline-flex rounded-control p-2 ${ACCENT_CLASSES[pillar.accent].chip}`}>
                {ACCENT_CLASSES[pillar.accent].icon}
              </div>
              <dt className="mt-4 font-bold text-brand-neutral-900">{pillar.title}</dt>
              <dd className="mt-2 text-sm text-brand-neutral-500">{pillar.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-16">
          <TestimonialsSection testimonials={testimonials} />
        </div>

        <h2 className="mt-16 text-[clamp(30px,4vw,44px)] font-extrabold tracking-tight text-brand-neutral-900">Partner with ABIES</h2>
        <p className="mt-2 max-w-2xl text-sm text-brand-neutral-500">
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
              className="block rounded-card border border-brand-neutral-200 bg-white p-5 transition-all hover:-translate-y-1 hover:border-brand-purple-200 hover:shadow-brand"
            >
              <p className="font-bold text-brand-neutral-900">{p.title}</p>
              <p className="mt-1.5 text-sm text-brand-neutral-500">{p.body}</p>
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
