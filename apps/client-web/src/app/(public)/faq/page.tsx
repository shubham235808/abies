import { activeFaqEntries } from '@abies/domain/modules/content/faq.service';
import { FaqAccordion } from '@/components/content/faq-accordion';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('faq');
}

// Reads the DB on every request — same rule as the homepage's promotion
// banner and the About Us page (the build stage has no DB to query against).
export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  const entries = await activeFaqEntries();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-magenta-600">FAQ</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">Frequently asked questions</h1>
      {entries.length > 0 ? (
        <FaqAccordion items={entries} />
      ) : (
        <p className="mt-6 text-sm text-brand-neutral-500">No FAQ entries have been published yet.</p>
      )}
    </main>
  );
}
