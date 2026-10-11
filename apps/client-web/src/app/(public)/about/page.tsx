import { activeAboutPage } from '@abies/domain/modules/content/about.service';
import { ContentPageBody } from '@/components/content/content-page-body';
import { currentContentLanguage } from '@/lib/content-language';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('about');
}

// Reads the DB on every request, never prerendered — same rule already
// applied to the homepage's promotion banner and to /diagnostics and
// /doctors (the build stage has no DB to query against).
export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const page = await activeAboutPage(await currentContentLanguage());

  if (page) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">About ABIES</p>
        <div lang={page.language}>
          <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">{page.title}</h1>
          <ContentPageBody body={page.body} />
        </div>
      </main>
    );
  }

  // No admin-published page yet — the built-in default, never a blank
  // screen. Per docs/PORTAL-UX-SPEC.md's "no content -> honest fallback,
  // never a placeholder" posture already applied to Promotion.
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">About ABIES</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">
        A care-orchestration network, not just a booking app
      </h1>
      <p className="mt-4 text-brand-neutral-600">
        The gap in Ayurveda care today isn&apos;t a lack of online options — it&apos;s that consultation,
        diagnostics, medicine fulfilment and Panchakarma all happen in disconnected places, coordinated
        by nothing but the patient&apos;s own memory. ABIES exists to close that gap: one coordinated
        treatment journey, connecting patients with verified practitioners and the partners who fulfil
        their care plan.
      </p>

      <div className="mt-10 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-brand-neutral-900">What ABIES is</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-brand-neutral-600">
            <li>A patient-facing care journey application.</li>
            <li>A clinical workflow and practice operating system for independent practitioners.</li>
            <li>A referral and coordination network for diagnostic labs, pharmacies and Panchakarma centres.</li>
            <li>A trust, consent and records layer across every participant in that journey.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-brand-neutral-900">What ABIES is not</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-brand-neutral-600">
            <li>Not a marketplace that ranks providers by commission paid.</li>
            <li>Not an AI system that diagnoses or prescribes without an accountable practitioner.</li>
            <li>Not a supplement shop disguised as a medical consultation product.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-brand-neutral-900">Clinical authority</h2>
          <p className="mt-2 text-brand-neutral-600">
            Every treatment decision on ABIES is made by a qualified, registration-verified
            practitioner. The platform coordinates the journey — appointments, diagnostics, medicine
            fulfilment, Panchakarma sessions and follow-up — but never substitutes its own judgement for
            a clinician&apos;s.
          </p>
        </section>
      </div>
    </main>
  );
}
