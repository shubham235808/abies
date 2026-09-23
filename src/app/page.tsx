// Public homepage. Per the build brief's No-Fake-Functionality policy: no
// call-to-action here pretends to do something the backend doesn't yet
// support (login/booking/discovery ship in later phases — see
// docs/IMPLEMENTATION-PLAN.md). Content only, until those are real.

const PILLARS = [
  {
    title: 'Verified practitioners',
    body: 'Every Ayurveda doctor is reviewed against their registration council and qualification documents before appearing in search.',
  },
  {
    title: 'One coordinated care plan',
    body: 'Consultations, diagnostics, medicines, Panchakarma and follow-up are organised around a single treatment timeline, not disconnected bookings.',
  },
  {
    title: 'Diagnostics, done properly',
    body: 'Clinician-ordered tests route through verified labs, with results returned to both you and your practitioner.',
  },
  {
    title: 'Continuous follow-up',
    body: 'Reminders and care coordination keep your treatment on track between visits.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-brand-purple-600">ABIES</p>
      <h1 className="mt-2 text-4xl font-semibold text-brand-neutral-900 sm:text-5xl">
        Trusted, coordinated Ayurveda care
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-brand-neutral-600">
        ABIES connects patients with verified Ayurveda practitioners, diagnostics, medicine
        fulfilment and Panchakarma centres through one coordinated treatment journey — not a set
        of disconnected bookings.
      </p>

      <div className="mt-4 inline-flex items-center gap-2 rounded-card border border-brand-neutral-200 bg-white px-4 py-2 text-sm text-brand-neutral-600">
        Patient and doctor sign-in — Coming soon
      </div>

      <dl className="mt-14 grid gap-8 sm:grid-cols-2">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="rounded-card border border-brand-neutral-200 bg-white p-6">
            <dt className="font-semibold text-brand-neutral-900">{pillar.title}</dt>
            <dd className="mt-2 text-sm text-brand-neutral-600">{pillar.body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-14 text-xs text-brand-neutral-400">
        ABIES is a care-coordination platform, not a substitute for professional medical
        judgement. Clinical decisions are made by qualified, verified practitioners.
      </p>
    </main>
  );
}
