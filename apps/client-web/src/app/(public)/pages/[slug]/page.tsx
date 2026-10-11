import { notFound, permanentRedirect } from 'next/navigation';
import { dedicatedPathForContentPage } from '@abies/domain/modules/content/pages.schemas';
import { activeContentPageBySlug } from '@abies/domain/modules/content/pages.service';
import { contentPageSeoFallback, seoKeyForContentPage } from '@abies/domain/modules/content/seo.pages';
import { ContentPageBody } from '@/components/content/content-page-body';
import { currentContentLanguage } from '@/lib/content-language';
import { pageMetadata } from '@/lib/seo';

// Any admin-created ContentPage slug, read live on every request — a new
// page goes public the moment it's published, no code change or rebuild.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const page = dedicatedPathForContentPage(slug) ? null : await activeContentPageBySlug(slug, await currentContentLanguage());
  if (!page) return {};
  return pageMetadata(seoKeyForContentPage(slug), contentPageSeoFallback(page));
}

export default async function ContentPageRoute({ params }: Props) {
  const { slug } = await params;
  // Slugs with their own hand-built route (about-us -> /about, etc.) are
  // served there — one canonical URL per page.
  const target = dedicatedPathForContentPage(slug);
  if (target) permanentRedirect(target);

  const page = await activeContentPageBySlug(slug, await currentContentLanguage());
  if (!page) notFound();

  return (
    <main lang={page.language} className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">{page.title}</h1>
      <ContentPageBody body={page.body} />
    </main>
  );
}
