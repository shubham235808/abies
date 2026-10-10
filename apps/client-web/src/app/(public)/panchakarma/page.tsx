import { facets, searchPublic } from '@abies/domain/modules/panchakarma/catalogue.service';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { PanchakarmaFilters } from './filters';
import { TherapyCard } from './therapy-card';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('panchakarma');
}
// Live search results — must render per-request, never prerendered at
// build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

export default async function PanchakarmaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ therapies, total }, facetData, session] = await Promise.all([
    searchPublic({ q: params.q, city: params.city }),
    facets(),
    getCurrentSession(),
  ]);

  return (
    <main>
      <div className="bg-gradient-to-br from-brand-orange-50 via-white to-brand-purple-50">
        <div className="mx-auto max-w-5xl px-6 pb-8 pt-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-purple-600">Panchakarma</p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900">Book a Panchakarma therapy</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
            Every therapy below is offered by a centre reviewed and approved by ABIES. Your doctor may also
            recommend a specific therapy after a consultation — you&apos;ll find that under Panchakarma in your
            patient dashboard, where each session is tracked back to your care plan.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { title: 'Verified centres', body: 'Every centre is reviewed before it can list therapies.' },
              { title: 'Doctor-guided care', body: 'Sessions your practitioner recommends stay linked to your care plan.' },
              { title: 'Real availability', body: 'Book against a centre’s actual open sessions, not a waitlist.' },
            ].map((item) => (
              <div key={item.title} className="rounded-card border border-brand-neutral-200 bg-white p-4">
                <p className="text-sm font-semibold text-brand-neutral-900">{item.title}</p>
                <p className="mt-1 text-xs text-brand-neutral-500">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-6">
        <PanchakarmaFilters facets={facetData} />

        <p className="mt-6 text-sm text-brand-neutral-500">{total} therapy(ies) found</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {therapies.map((t) => (
            <TherapyCard key={t.id} therapy={t} viewerRole={session?.user.role ?? null} />
          ))}
        </div>
        {therapies.length === 0 && (
          <p className="mt-10 text-center text-sm text-brand-neutral-500">
            No therapies match those filters yet. Try broadening your search.
          </p>
        )}
      </div>
    </main>
  );
}
