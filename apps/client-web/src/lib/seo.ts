import type { Metadata } from 'next';
import { connection } from 'next/server';
import { resolvePageSeo } from '@abies/domain/modules/content/seo.service';

// Shared generateMetadata body for every admin-SEO-managed public page.
// connection() keeps the lookup out of any build-time prerender (no DB
// there), so metadata is read live per request like the page content.
export async function pageMetadata(pageKey: string, fallback?: { title: string; description: string }): Promise<Metadata> {
  await connection();
  const seo = await resolvePageSeo(pageKey, fallback);
  const images = seo.ogImageUrl ? [{ url: seo.ogImageUrl }] : undefined;
  return {
    title: seo.title,
    description: seo.description,
    ...(seo.keywords.length > 0 ? { keywords: seo.keywords } : {}),
    openGraph: {
      title: seo.title,
      description: seo.description,
      siteName: 'ABIES',
      type: 'website',
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: seo.title,
      description: seo.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}
