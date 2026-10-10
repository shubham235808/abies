import { Alert } from '@abies/design-system/components/ui/alert';
import { listActiveArtifacts } from '@abies/domain/modules/consent/consent.service';
import { activeContentPageBySlug } from '@abies/domain/modules/content/pages.service';
import { ContentPageBody } from '@/components/content/content-page-body';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('terms');
}

// Reads live consent artifacts from the database — must render per-request,
// never prerendered at build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

export default async function TermsPage() {
  const [artifacts, cmsPage] = await Promise.all([listActiveArtifacts(), activeContentPageBySlug('terms')]);
  const relevant = artifacts.filter((a) => ['terms', 'teleconsultation'].includes(a.key));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* Admin-published policy text (ContentPage slug "terms") replaces the
          pending-review notice; the live consent artifacts stay listed below
          either way since they're what an account actually accepts. */}
      {cmsPage ? (
        <>
          <h1 className="text-3xl font-semibold text-brand-neutral-900">{cmsPage.title}</h1>
          <ContentPageBody body={cmsPage.body} />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold text-brand-neutral-900">Terms of Service</h1>
          <Alert tone="info" className="mt-6">
            Full policy text is pending legal review and isn&apos;t published yet. What&apos;s below is the
            real, currently active set of consent artifacts your account is asked to accept — not
            placeholder legal copy.
          </Alert>
        </>
      )}

      <div className="mt-6 space-y-3">
        {relevant.map((a) => (
          <div key={a.id} className="rounded-card border border-brand-neutral-200 bg-white p-4">
            <p className="font-medium text-brand-neutral-900">{a.title}</p>
            <p className="text-sm text-brand-neutral-500">
              Version {a.version} · {a.required ? 'Required' : 'Optional'}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-brand-neutral-500">
        One product principle that will carry into the final terms regardless of legal drafting:
        clinical authority stays with qualified practitioners, and marketplace incentives must never
        influence a treatment decision.
      </p>
    </main>
  );
}
