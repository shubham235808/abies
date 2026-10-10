import { Alert } from '@abies/design-system/components/ui/alert';
import { listActiveArtifacts } from '@abies/domain/modules/consent/consent.service';
import { activeContentPageBySlug } from '@abies/domain/modules/content/pages.service';
import { ContentPageBody } from '@/components/content/content-page-body';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  return pageMetadata('privacy');
}

// Reads live consent artifacts from the database — must render per-request,
// never prerendered at build time (the build stage has no DB to query).
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const [artifacts, cmsPage] = await Promise.all([listActiveArtifacts(), activeContentPageBySlug('privacy')]);
  const relevant = artifacts.filter((a) => ['privacy', 'health-data-processing', 'record-sharing'].includes(a.key));

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* Admin-published policy text (ContentPage slug "privacy") replaces the
          pending-review notice; the live consent artifacts stay listed below
          either way since they're what an account actually accepts. */}
      {cmsPage ? (
        <>
          <h1 className="text-3xl font-semibold text-brand-neutral-900">{cmsPage.title}</h1>
          <ContentPageBody body={cmsPage.body} />
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold text-brand-neutral-900">Privacy Notice</h1>
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

      {/* Says a lawyer-reviewed policy "will replace this page" — untrue once one has been published. */}
      {!cmsPage && (
        <p className="mt-8 text-sm text-brand-neutral-500">
          Design principles this platform is built around (docs/SECURITY-MODEL.md): purpose-specific
          consent, minimum-necessary disclosure to partners, an immutable audit trail for sensitive data
          access, and encryption in transit and at rest. These are engineering commitments already in
          place — they don&apos;t replace a lawyer-reviewed privacy policy, which will replace this page.
        </p>
      )}
    </main>
  );
}
