import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ServedBlogPost } from '@abies/domain/modules/content/blog.service';
import { resolvePageSeo } from '@abies/domain/modules/content/seo.service';
import { currentContentLanguage } from './content-language';

// Shared generateMetadata body for every admin-SEO-managed public page.
// connection() keeps the lookup out of any build-time prerender (no DB
// there), so metadata is read live per request like the page content.
export async function pageMetadata(pageKey: string, fallback?: { title: string; description: string }): Promise<Metadata> {
  await connection();
  const seo = await resolvePageSeo(pageKey, fallback, await currentContentLanguage());
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

// Blog posts are per-entity, not per-page, so they have no PageSeoMetadata
// row: the post's own title, summary and cover image already are its
// admin-edited metadata.
export function blogPostMetadata(post: ServedBlogPost): Metadata {
  const title = `${post.title} — ABIES`;
  const images = post.coverImageUrl ? [{ url: post.coverImageUrl }] : undefined;
  return {
    title,
    description: post.excerpt,
    authors: [{ name: post.authorName }],
    openGraph: {
      title,
      description: post.excerpt,
      siteName: 'ABIES',
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.authorName],
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description: post.excerpt,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
  };
}
