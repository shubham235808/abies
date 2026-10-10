import { facets, searchPackagesPublic, searchPublic } from '@abies/domain/modules/diagnostics/catalogue.service';
import { getCurrentSession } from '@abies/domain/server/current-user';
import { DiagnosticsFilters } from './filters';
import { PackageCard } from './package-card';
import { TestCard } from './test-card';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('diagnostics');
}
// Live search results — must render per-request, never prerendered at
// build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const [{ tests, total }, { packages, total: packageTotal }, facetData, session] = await Promise.all([
    searchPublic({ q: params.q, city: params.city }),
    searchPackagesPublic({ q: params.q, city: params.city }),
    facets(),
    getCurrentSession(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-blue-600">Diagnostics</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900">Book a diagnostic test</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Every test below is offered by a lab reviewed and approved by ABIES. Your doctor may also recommend a
        specific test after a consultation — you&apos;ll find that under Diagnostics in your patient dashboard.
      </p>

      <div className="mt-6">
        <DiagnosticsFilters facets={facetData} />
      </div>

      {packageTotal > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-brand-neutral-900">Health packages</h2>
          <p className="mt-1 text-sm text-brand-neutral-500">{packageTotal} package(s) found</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {packages.map((p) => (
              <PackageCard key={p.id} diagnosticPackage={p} viewerRole={session?.user.role ?? null} />
            ))}
          </div>
        </>
      )}

      <h2 className="mt-10 text-lg font-semibold text-brand-neutral-900">Individual tests</h2>
      <p className="mt-1 text-sm text-brand-neutral-500">{total} test(s) found</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {tests.map((t) => (
          <TestCard key={t.id} test={t} viewerRole={session?.user.role ?? null} />
        ))}
      </div>
      {tests.length === 0 && (
        <p className="mt-10 text-center text-sm text-brand-neutral-500">
          No tests match those filters yet. Try broadening your search.
        </p>
      )}
    </main>
  );
}
