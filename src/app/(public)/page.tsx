// Public homepage. Per the build brief's No-Fake-Functionality policy: no
// call-to-action here pretends to do something the backend doesn't yet
// support. Sign-in and doctor discovery are real as of Phase 1/3 — their
// CTAs link to working pages; appointment booking still doesn't exist, so
// that stays an honest "coming soon" rather than a dead button.
import Link from 'next/link';

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

export default function HomePage() {
  return (
    <main>
      <div className="bg-gradient-to-br from-brand-purple-50 via-white to-brand-blue-50">
        <div className="mx-auto max-w-5xl px-6 pb-16 pt-14">
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
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-neutral-200 bg-white px-3 py-1.5 text-xs text-brand-neutral-500">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-orange-500" />
              Appointment booking — coming soon
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16">
        <dl className="mt-10 grid gap-6 sm:grid-cols-2">
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

        <p className="mt-14 border-t border-brand-neutral-200 pt-6 text-xs text-brand-neutral-400">
          ABIES is a care-coordination platform, not a substitute for professional medical
          judgement. Clinical decisions are made by qualified, verified practitioners.
        </p>
      </div>
    </main>
  );
}
